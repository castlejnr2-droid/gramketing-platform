/**
 * GET /api/fee-tx?durationDays=14&currency=TON
 *
 * Returns TonConnect transaction parameters for paying the platform access fee
 * directly to TREASURY_WALLET_ADDRESS. Called from CreatePoolStepper step 1
 * before the pool is created.
 *
 * For TON fees: { to, amount }
 * For mGRAM fees: { to, amount, payload }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthWallet } from '@/lib/auth';
import { calculateFeeInTokens } from '@/lib/prices';
import { buildFeeTransaction, buildJettonFeeTransaction, getJettonDecimals } from '@/lib/gramketing-pool-contract';
import { toNano } from '@ton/core';

export async function GET(req: NextRequest) {
  try {
    const walletAddress = await getAuthWallet(req);
    if (!walletAddress) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const durationDaysStr = searchParams.get('durationDays');
    const currency = searchParams.get('currency');

    if (!durationDaysStr || !currency) {
      return NextResponse.json({ error: 'Missing durationDays or currency' }, { status: 400 });
    }

    const durationDays = parseInt(durationDaysStr, 10);
    if (![7, 14, 21, 28].includes(durationDays)) {
      return NextResponse.json({ error: 'durationDays must be 7, 14, 21, or 28' }, { status: 400 });
    }

    if (!['TON', 'MGRAM'].includes(currency)) {
      return NextResponse.json({ error: 'currency must be TON or MGRAM' }, { status: 400 });
    }

    const treasuryAddress = process.env.TREASURY_WALLET_ADDRESS;
    if (!treasuryAddress) {
      return NextResponse.json(
        { error: 'TREASURY_WALLET_ADDRESS is not configured - contact support' },
        { status: 500 },
      );
    }

    const { usdAmount, tokenAmount } = await calculateFeeInTokens(
      durationDays,
      currency as 'TON' | 'MGRAM',
    );

    // Fail-closed: if the MGRAM oracle is down, tokenAmount comes back 0 and we
    // must not build a transaction for 0 tokens.
    if (currency === 'MGRAM' && tokenAmount === 0) {
      return NextResponse.json(
        { error: 'MGRAM fee price temporarily unavailable, try again' },
        { status: 503 },
      );
    }

    if (currency === 'TON') {
      const amountNano = toNano(tokenAmount.toFixed(9));
      const tx = buildFeeTransaction({ treasuryAddress, amountNano });
      return NextResponse.json({
        ...tx,
        expectedFee: { usdAmount, tokenAmount },
      });
    }

    // mGRAM jetton fee
    const mgramMasterAddress = process.env.MGRAM_JETTON_MASTER_ADDRESS;
    if (!mgramMasterAddress) {
      return NextResponse.json(
        { error: 'MGRAM_JETTON_MASTER_ADDRESS is not configured' },
        { status: 500 },
      );
    }

    const mgramDecimals = await getJettonDecimals(mgramMasterAddress);
    const amountRaw = BigInt(Math.round(tokenAmount * Math.pow(10, mgramDecimals)));

    let tx: Awaited<ReturnType<typeof buildJettonFeeTransaction>>;
    try {
      tx = await buildJettonFeeTransaction({
        jettonMasterAddress: mgramMasterAddress,
        senderAddress: walletAddress,
        treasuryAddress,
        amountRaw,
      });
    } catch (rpcErr) {
      const detail = rpcErr instanceof Error ? rpcErr.message : String(rpcErr);
      console.error('GET /api/fee-tx: jetton wallet lookup failed:', detail);
      return NextResponse.json(
        { error: 'Fee unavailable — wallet lookup failed, please retry', detail },
        { status: 503 },
      );
    }

    return NextResponse.json({
      ...tx,
      expectedFee: { usdAmount, tokenAmount },
    });
  } catch (err) {
    console.error('GET /api/fee-tx error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
