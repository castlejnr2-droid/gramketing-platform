import {
    Cell,
    Slice,
    Address,
    Builder,
    beginCell,
    ComputeError,
    TupleItem,
    TupleReader,
    Dictionary,
    contractAddress,
    address,
    ContractProvider,
    Sender,
    Contract,
    ContractABI,
    ABIType,
    ABIGetter,
    ABIReceiver,
    TupleBuilder,
    DictionaryValue
} from '@ton/core';

export type DataSize = {
    $$type: 'DataSize';
    cells: bigint;
    bits: bigint;
    refs: bigint;
}

export function storeDataSize(src: DataSize) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeInt(src.cells, 257);
        b_0.storeInt(src.bits, 257);
        b_0.storeInt(src.refs, 257);
    };
}

export function loadDataSize(slice: Slice) {
    const sc_0 = slice;
    const _cells = sc_0.loadIntBig(257);
    const _bits = sc_0.loadIntBig(257);
    const _refs = sc_0.loadIntBig(257);
    return { $$type: 'DataSize' as const, cells: _cells, bits: _bits, refs: _refs };
}

export function loadTupleDataSize(source: TupleReader) {
    const _cells = source.readBigNumber();
    const _bits = source.readBigNumber();
    const _refs = source.readBigNumber();
    return { $$type: 'DataSize' as const, cells: _cells, bits: _bits, refs: _refs };
}

export function loadGetterTupleDataSize(source: TupleReader) {
    const _cells = source.readBigNumber();
    const _bits = source.readBigNumber();
    const _refs = source.readBigNumber();
    return { $$type: 'DataSize' as const, cells: _cells, bits: _bits, refs: _refs };
}

export function storeTupleDataSize(source: DataSize) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.cells);
    builder.writeNumber(source.bits);
    builder.writeNumber(source.refs);
    return builder.build();
}

export function dictValueParserDataSize(): DictionaryValue<DataSize> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeDataSize(src)).endCell());
        },
        parse: (src) => {
            return loadDataSize(src.loadRef().beginParse());
        }
    }
}

export type SignedBundle = {
    $$type: 'SignedBundle';
    signature: Buffer;
    signedData: Slice;
}

export function storeSignedBundle(src: SignedBundle) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeBuffer(src.signature);
        b_0.storeBuilder(src.signedData.asBuilder());
    };
}

export function loadSignedBundle(slice: Slice) {
    const sc_0 = slice;
    const _signature = sc_0.loadBuffer(64);
    const _signedData = sc_0;
    return { $$type: 'SignedBundle' as const, signature: _signature, signedData: _signedData };
}

export function loadTupleSignedBundle(source: TupleReader) {
    const _signature = source.readBuffer();
    const _signedData = source.readCell().asSlice();
    return { $$type: 'SignedBundle' as const, signature: _signature, signedData: _signedData };
}

export function loadGetterTupleSignedBundle(source: TupleReader) {
    const _signature = source.readBuffer();
    const _signedData = source.readCell().asSlice();
    return { $$type: 'SignedBundle' as const, signature: _signature, signedData: _signedData };
}

export function storeTupleSignedBundle(source: SignedBundle) {
    const builder = new TupleBuilder();
    builder.writeBuffer(source.signature);
    builder.writeSlice(source.signedData.asCell());
    return builder.build();
}

export function dictValueParserSignedBundle(): DictionaryValue<SignedBundle> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeSignedBundle(src)).endCell());
        },
        parse: (src) => {
            return loadSignedBundle(src.loadRef().beginParse());
        }
    }
}

export type StateInit = {
    $$type: 'StateInit';
    code: Cell;
    data: Cell;
}

export function storeStateInit(src: StateInit) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeRef(src.code);
        b_0.storeRef(src.data);
    };
}

export function loadStateInit(slice: Slice) {
    const sc_0 = slice;
    const _code = sc_0.loadRef();
    const _data = sc_0.loadRef();
    return { $$type: 'StateInit' as const, code: _code, data: _data };
}

export function loadTupleStateInit(source: TupleReader) {
    const _code = source.readCell();
    const _data = source.readCell();
    return { $$type: 'StateInit' as const, code: _code, data: _data };
}

export function loadGetterTupleStateInit(source: TupleReader) {
    const _code = source.readCell();
    const _data = source.readCell();
    return { $$type: 'StateInit' as const, code: _code, data: _data };
}

export function storeTupleStateInit(source: StateInit) {
    const builder = new TupleBuilder();
    builder.writeCell(source.code);
    builder.writeCell(source.data);
    return builder.build();
}

export function dictValueParserStateInit(): DictionaryValue<StateInit> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeStateInit(src)).endCell());
        },
        parse: (src) => {
            return loadStateInit(src.loadRef().beginParse());
        }
    }
}

export type Context = {
    $$type: 'Context';
    bounceable: boolean;
    sender: Address;
    value: bigint;
    raw: Slice;
}

export function storeContext(src: Context) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeBit(src.bounceable);
        b_0.storeAddress(src.sender);
        b_0.storeInt(src.value, 257);
        b_0.storeRef(src.raw.asCell());
    };
}

export function loadContext(slice: Slice) {
    const sc_0 = slice;
    const _bounceable = sc_0.loadBit();
    const _sender = sc_0.loadAddress();
    const _value = sc_0.loadIntBig(257);
    const _raw = sc_0.loadRef().asSlice();
    return { $$type: 'Context' as const, bounceable: _bounceable, sender: _sender, value: _value, raw: _raw };
}

export function loadTupleContext(source: TupleReader) {
    const _bounceable = source.readBoolean();
    const _sender = source.readAddress();
    const _value = source.readBigNumber();
    const _raw = source.readCell().asSlice();
    return { $$type: 'Context' as const, bounceable: _bounceable, sender: _sender, value: _value, raw: _raw };
}

export function loadGetterTupleContext(source: TupleReader) {
    const _bounceable = source.readBoolean();
    const _sender = source.readAddress();
    const _value = source.readBigNumber();
    const _raw = source.readCell().asSlice();
    return { $$type: 'Context' as const, bounceable: _bounceable, sender: _sender, value: _value, raw: _raw };
}

export function storeTupleContext(source: Context) {
    const builder = new TupleBuilder();
    builder.writeBoolean(source.bounceable);
    builder.writeAddress(source.sender);
    builder.writeNumber(source.value);
    builder.writeSlice(source.raw.asCell());
    return builder.build();
}

export function dictValueParserContext(): DictionaryValue<Context> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeContext(src)).endCell());
        },
        parse: (src) => {
            return loadContext(src.loadRef().beginParse());
        }
    }
}

export type SendParameters = {
    $$type: 'SendParameters';
    mode: bigint;
    body: Cell | null;
    code: Cell | null;
    data: Cell | null;
    value: bigint;
    to: Address;
    bounce: boolean;
}

export function storeSendParameters(src: SendParameters) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeInt(src.mode, 257);
        if (src.body !== null && src.body !== undefined) { b_0.storeBit(true).storeRef(src.body); } else { b_0.storeBit(false); }
        if (src.code !== null && src.code !== undefined) { b_0.storeBit(true).storeRef(src.code); } else { b_0.storeBit(false); }
        if (src.data !== null && src.data !== undefined) { b_0.storeBit(true).storeRef(src.data); } else { b_0.storeBit(false); }
        b_0.storeInt(src.value, 257);
        b_0.storeAddress(src.to);
        b_0.storeBit(src.bounce);
    };
}

export function loadSendParameters(slice: Slice) {
    const sc_0 = slice;
    const _mode = sc_0.loadIntBig(257);
    const _body = sc_0.loadBit() ? sc_0.loadRef() : null;
    const _code = sc_0.loadBit() ? sc_0.loadRef() : null;
    const _data = sc_0.loadBit() ? sc_0.loadRef() : null;
    const _value = sc_0.loadIntBig(257);
    const _to = sc_0.loadAddress();
    const _bounce = sc_0.loadBit();
    return { $$type: 'SendParameters' as const, mode: _mode, body: _body, code: _code, data: _data, value: _value, to: _to, bounce: _bounce };
}

export function loadTupleSendParameters(source: TupleReader) {
    const _mode = source.readBigNumber();
    const _body = source.readCellOpt();
    const _code = source.readCellOpt();
    const _data = source.readCellOpt();
    const _value = source.readBigNumber();
    const _to = source.readAddress();
    const _bounce = source.readBoolean();
    return { $$type: 'SendParameters' as const, mode: _mode, body: _body, code: _code, data: _data, value: _value, to: _to, bounce: _bounce };
}

export function loadGetterTupleSendParameters(source: TupleReader) {
    const _mode = source.readBigNumber();
    const _body = source.readCellOpt();
    const _code = source.readCellOpt();
    const _data = source.readCellOpt();
    const _value = source.readBigNumber();
    const _to = source.readAddress();
    const _bounce = source.readBoolean();
    return { $$type: 'SendParameters' as const, mode: _mode, body: _body, code: _code, data: _data, value: _value, to: _to, bounce: _bounce };
}

export function storeTupleSendParameters(source: SendParameters) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.mode);
    builder.writeCell(source.body);
    builder.writeCell(source.code);
    builder.writeCell(source.data);
    builder.writeNumber(source.value);
    builder.writeAddress(source.to);
    builder.writeBoolean(source.bounce);
    return builder.build();
}

export function dictValueParserSendParameters(): DictionaryValue<SendParameters> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeSendParameters(src)).endCell());
        },
        parse: (src) => {
            return loadSendParameters(src.loadRef().beginParse());
        }
    }
}

export type MessageParameters = {
    $$type: 'MessageParameters';
    mode: bigint;
    body: Cell | null;
    value: bigint;
    to: Address;
    bounce: boolean;
}

export function storeMessageParameters(src: MessageParameters) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeInt(src.mode, 257);
        if (src.body !== null && src.body !== undefined) { b_0.storeBit(true).storeRef(src.body); } else { b_0.storeBit(false); }
        b_0.storeInt(src.value, 257);
        b_0.storeAddress(src.to);
        b_0.storeBit(src.bounce);
    };
}

export function loadMessageParameters(slice: Slice) {
    const sc_0 = slice;
    const _mode = sc_0.loadIntBig(257);
    const _body = sc_0.loadBit() ? sc_0.loadRef() : null;
    const _value = sc_0.loadIntBig(257);
    const _to = sc_0.loadAddress();
    const _bounce = sc_0.loadBit();
    return { $$type: 'MessageParameters' as const, mode: _mode, body: _body, value: _value, to: _to, bounce: _bounce };
}

export function loadTupleMessageParameters(source: TupleReader) {
    const _mode = source.readBigNumber();
    const _body = source.readCellOpt();
    const _value = source.readBigNumber();
    const _to = source.readAddress();
    const _bounce = source.readBoolean();
    return { $$type: 'MessageParameters' as const, mode: _mode, body: _body, value: _value, to: _to, bounce: _bounce };
}

export function loadGetterTupleMessageParameters(source: TupleReader) {
    const _mode = source.readBigNumber();
    const _body = source.readCellOpt();
    const _value = source.readBigNumber();
    const _to = source.readAddress();
    const _bounce = source.readBoolean();
    return { $$type: 'MessageParameters' as const, mode: _mode, body: _body, value: _value, to: _to, bounce: _bounce };
}

export function storeTupleMessageParameters(source: MessageParameters) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.mode);
    builder.writeCell(source.body);
    builder.writeNumber(source.value);
    builder.writeAddress(source.to);
    builder.writeBoolean(source.bounce);
    return builder.build();
}

export function dictValueParserMessageParameters(): DictionaryValue<MessageParameters> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeMessageParameters(src)).endCell());
        },
        parse: (src) => {
            return loadMessageParameters(src.loadRef().beginParse());
        }
    }
}

export type DeployParameters = {
    $$type: 'DeployParameters';
    mode: bigint;
    body: Cell | null;
    value: bigint;
    bounce: boolean;
    init: StateInit;
}

export function storeDeployParameters(src: DeployParameters) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeInt(src.mode, 257);
        if (src.body !== null && src.body !== undefined) { b_0.storeBit(true).storeRef(src.body); } else { b_0.storeBit(false); }
        b_0.storeInt(src.value, 257);
        b_0.storeBit(src.bounce);
        b_0.store(storeStateInit(src.init));
    };
}

export function loadDeployParameters(slice: Slice) {
    const sc_0 = slice;
    const _mode = sc_0.loadIntBig(257);
    const _body = sc_0.loadBit() ? sc_0.loadRef() : null;
    const _value = sc_0.loadIntBig(257);
    const _bounce = sc_0.loadBit();
    const _init = loadStateInit(sc_0);
    return { $$type: 'DeployParameters' as const, mode: _mode, body: _body, value: _value, bounce: _bounce, init: _init };
}

export function loadTupleDeployParameters(source: TupleReader) {
    const _mode = source.readBigNumber();
    const _body = source.readCellOpt();
    const _value = source.readBigNumber();
    const _bounce = source.readBoolean();
    const _init = loadTupleStateInit(source);
    return { $$type: 'DeployParameters' as const, mode: _mode, body: _body, value: _value, bounce: _bounce, init: _init };
}

export function loadGetterTupleDeployParameters(source: TupleReader) {
    const _mode = source.readBigNumber();
    const _body = source.readCellOpt();
    const _value = source.readBigNumber();
    const _bounce = source.readBoolean();
    const _init = loadGetterTupleStateInit(source);
    return { $$type: 'DeployParameters' as const, mode: _mode, body: _body, value: _value, bounce: _bounce, init: _init };
}

export function storeTupleDeployParameters(source: DeployParameters) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.mode);
    builder.writeCell(source.body);
    builder.writeNumber(source.value);
    builder.writeBoolean(source.bounce);
    builder.writeTuple(storeTupleStateInit(source.init));
    return builder.build();
}

export function dictValueParserDeployParameters(): DictionaryValue<DeployParameters> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeDeployParameters(src)).endCell());
        },
        parse: (src) => {
            return loadDeployParameters(src.loadRef().beginParse());
        }
    }
}

export type StdAddress = {
    $$type: 'StdAddress';
    workchain: bigint;
    address: bigint;
}

export function storeStdAddress(src: StdAddress) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeInt(src.workchain, 8);
        b_0.storeUint(src.address, 256);
    };
}

export function loadStdAddress(slice: Slice) {
    const sc_0 = slice;
    const _workchain = sc_0.loadIntBig(8);
    const _address = sc_0.loadUintBig(256);
    return { $$type: 'StdAddress' as const, workchain: _workchain, address: _address };
}

export function loadTupleStdAddress(source: TupleReader) {
    const _workchain = source.readBigNumber();
    const _address = source.readBigNumber();
    return { $$type: 'StdAddress' as const, workchain: _workchain, address: _address };
}

export function loadGetterTupleStdAddress(source: TupleReader) {
    const _workchain = source.readBigNumber();
    const _address = source.readBigNumber();
    return { $$type: 'StdAddress' as const, workchain: _workchain, address: _address };
}

export function storeTupleStdAddress(source: StdAddress) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.workchain);
    builder.writeNumber(source.address);
    return builder.build();
}

export function dictValueParserStdAddress(): DictionaryValue<StdAddress> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeStdAddress(src)).endCell());
        },
        parse: (src) => {
            return loadStdAddress(src.loadRef().beginParse());
        }
    }
}

export type VarAddress = {
    $$type: 'VarAddress';
    workchain: bigint;
    address: Slice;
}

export function storeVarAddress(src: VarAddress) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeInt(src.workchain, 32);
        b_0.storeRef(src.address.asCell());
    };
}

export function loadVarAddress(slice: Slice) {
    const sc_0 = slice;
    const _workchain = sc_0.loadIntBig(32);
    const _address = sc_0.loadRef().asSlice();
    return { $$type: 'VarAddress' as const, workchain: _workchain, address: _address };
}

export function loadTupleVarAddress(source: TupleReader) {
    const _workchain = source.readBigNumber();
    const _address = source.readCell().asSlice();
    return { $$type: 'VarAddress' as const, workchain: _workchain, address: _address };
}

export function loadGetterTupleVarAddress(source: TupleReader) {
    const _workchain = source.readBigNumber();
    const _address = source.readCell().asSlice();
    return { $$type: 'VarAddress' as const, workchain: _workchain, address: _address };
}

export function storeTupleVarAddress(source: VarAddress) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.workchain);
    builder.writeSlice(source.address.asCell());
    return builder.build();
}

export function dictValueParserVarAddress(): DictionaryValue<VarAddress> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeVarAddress(src)).endCell());
        },
        parse: (src) => {
            return loadVarAddress(src.loadRef().beginParse());
        }
    }
}

export type BasechainAddress = {
    $$type: 'BasechainAddress';
    hash: bigint | null;
}

export function storeBasechainAddress(src: BasechainAddress) {
    return (builder: Builder) => {
        const b_0 = builder;
        if (src.hash !== null && src.hash !== undefined) { b_0.storeBit(true).storeInt(src.hash, 257); } else { b_0.storeBit(false); }
    };
}

export function loadBasechainAddress(slice: Slice) {
    const sc_0 = slice;
    const _hash = sc_0.loadBit() ? sc_0.loadIntBig(257) : null;
    return { $$type: 'BasechainAddress' as const, hash: _hash };
}

export function loadTupleBasechainAddress(source: TupleReader) {
    const _hash = source.readBigNumberOpt();
    return { $$type: 'BasechainAddress' as const, hash: _hash };
}

export function loadGetterTupleBasechainAddress(source: TupleReader) {
    const _hash = source.readBigNumberOpt();
    return { $$type: 'BasechainAddress' as const, hash: _hash };
}

export function storeTupleBasechainAddress(source: BasechainAddress) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.hash);
    return builder.build();
}

export function dictValueParserBasechainAddress(): DictionaryValue<BasechainAddress> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeBasechainAddress(src)).endCell());
        },
        parse: (src) => {
            return loadBasechainAddress(src.loadRef().beginParse());
        }
    }
}

export type Deploy = {
    $$type: 'Deploy';
    queryId: bigint;
}

export function storeDeploy(src: Deploy) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(2490013878, 32);
        b_0.storeUint(src.queryId, 64);
    };
}

export function loadDeploy(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 2490013878) { throw Error('Invalid prefix'); }
    const _queryId = sc_0.loadUintBig(64);
    return { $$type: 'Deploy' as const, queryId: _queryId };
}

export function loadTupleDeploy(source: TupleReader) {
    const _queryId = source.readBigNumber();
    return { $$type: 'Deploy' as const, queryId: _queryId };
}

export function loadGetterTupleDeploy(source: TupleReader) {
    const _queryId = source.readBigNumber();
    return { $$type: 'Deploy' as const, queryId: _queryId };
}

export function storeTupleDeploy(source: Deploy) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.queryId);
    return builder.build();
}

export function dictValueParserDeploy(): DictionaryValue<Deploy> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeDeploy(src)).endCell());
        },
        parse: (src) => {
            return loadDeploy(src.loadRef().beginParse());
        }
    }
}

export type DeployOk = {
    $$type: 'DeployOk';
    queryId: bigint;
}

export function storeDeployOk(src: DeployOk) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(2952335191, 32);
        b_0.storeUint(src.queryId, 64);
    };
}

export function loadDeployOk(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 2952335191) { throw Error('Invalid prefix'); }
    const _queryId = sc_0.loadUintBig(64);
    return { $$type: 'DeployOk' as const, queryId: _queryId };
}

export function loadTupleDeployOk(source: TupleReader) {
    const _queryId = source.readBigNumber();
    return { $$type: 'DeployOk' as const, queryId: _queryId };
}

export function loadGetterTupleDeployOk(source: TupleReader) {
    const _queryId = source.readBigNumber();
    return { $$type: 'DeployOk' as const, queryId: _queryId };
}

export function storeTupleDeployOk(source: DeployOk) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.queryId);
    return builder.build();
}

export function dictValueParserDeployOk(): DictionaryValue<DeployOk> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeDeployOk(src)).endCell());
        },
        parse: (src) => {
            return loadDeployOk(src.loadRef().beginParse());
        }
    }
}

export type FactoryDeploy = {
    $$type: 'FactoryDeploy';
    queryId: bigint;
    cashback: Address;
}

export function storeFactoryDeploy(src: FactoryDeploy) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(1829761339, 32);
        b_0.storeUint(src.queryId, 64);
        b_0.storeAddress(src.cashback);
    };
}

export function loadFactoryDeploy(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 1829761339) { throw Error('Invalid prefix'); }
    const _queryId = sc_0.loadUintBig(64);
    const _cashback = sc_0.loadAddress();
    return { $$type: 'FactoryDeploy' as const, queryId: _queryId, cashback: _cashback };
}

export function loadTupleFactoryDeploy(source: TupleReader) {
    const _queryId = source.readBigNumber();
    const _cashback = source.readAddress();
    return { $$type: 'FactoryDeploy' as const, queryId: _queryId, cashback: _cashback };
}

export function loadGetterTupleFactoryDeploy(source: TupleReader) {
    const _queryId = source.readBigNumber();
    const _cashback = source.readAddress();
    return { $$type: 'FactoryDeploy' as const, queryId: _queryId, cashback: _cashback };
}

export function storeTupleFactoryDeploy(source: FactoryDeploy) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.queryId);
    builder.writeAddress(source.cashback);
    return builder.build();
}

export function dictValueParserFactoryDeploy(): DictionaryValue<FactoryDeploy> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeFactoryDeploy(src)).endCell());
        },
        parse: (src) => {
            return loadFactoryDeploy(src.loadRef().beginParse());
        }
    }
}

export type CreatePool = {
    $$type: 'CreatePool';
    jettonWalletAddress: Address;
    totalReward: bigint;
    durationDays: bigint;
    rewardSlots: bigint;
}

export function storeCreatePool(src: CreatePool) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(2970805445, 32);
        b_0.storeAddress(src.jettonWalletAddress);
        b_0.storeCoins(src.totalReward);
        b_0.storeUint(src.durationDays, 8);
        b_0.storeUint(src.rewardSlots, 8);
    };
}

export function loadCreatePool(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 2970805445) { throw Error('Invalid prefix'); }
    const _jettonWalletAddress = sc_0.loadAddress();
    const _totalReward = sc_0.loadCoins();
    const _durationDays = sc_0.loadUintBig(8);
    const _rewardSlots = sc_0.loadUintBig(8);
    return { $$type: 'CreatePool' as const, jettonWalletAddress: _jettonWalletAddress, totalReward: _totalReward, durationDays: _durationDays, rewardSlots: _rewardSlots };
}

export function loadTupleCreatePool(source: TupleReader) {
    const _jettonWalletAddress = source.readAddress();
    const _totalReward = source.readBigNumber();
    const _durationDays = source.readBigNumber();
    const _rewardSlots = source.readBigNumber();
    return { $$type: 'CreatePool' as const, jettonWalletAddress: _jettonWalletAddress, totalReward: _totalReward, durationDays: _durationDays, rewardSlots: _rewardSlots };
}

export function loadGetterTupleCreatePool(source: TupleReader) {
    const _jettonWalletAddress = source.readAddress();
    const _totalReward = source.readBigNumber();
    const _durationDays = source.readBigNumber();
    const _rewardSlots = source.readBigNumber();
    return { $$type: 'CreatePool' as const, jettonWalletAddress: _jettonWalletAddress, totalReward: _totalReward, durationDays: _durationDays, rewardSlots: _rewardSlots };
}

export function storeTupleCreatePool(source: CreatePool) {
    const builder = new TupleBuilder();
    builder.writeAddress(source.jettonWalletAddress);
    builder.writeNumber(source.totalReward);
    builder.writeNumber(source.durationDays);
    builder.writeNumber(source.rewardSlots);
    return builder.build();
}

export function dictValueParserCreatePool(): DictionaryValue<CreatePool> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeCreatePool(src)).endCell());
        },
        parse: (src) => {
            return loadCreatePool(src.loadRef().beginParse());
        }
    }
}

export type DistributeRewards = {
    $$type: 'DistributeRewards';
    winners: Dictionary<Address, bigint>;
}

export function storeDistributeRewards(src: DistributeRewards) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(4022601275, 32);
        b_0.storeDict(src.winners, Dictionary.Keys.Address(), Dictionary.Values.BigInt(257));
    };
}

export function loadDistributeRewards(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 4022601275) { throw Error('Invalid prefix'); }
    const _winners = Dictionary.load(Dictionary.Keys.Address(), Dictionary.Values.BigInt(257), sc_0);
    return { $$type: 'DistributeRewards' as const, winners: _winners };
}

export function loadTupleDistributeRewards(source: TupleReader) {
    const _winners = Dictionary.loadDirect(Dictionary.Keys.Address(), Dictionary.Values.BigInt(257), source.readCellOpt());
    return { $$type: 'DistributeRewards' as const, winners: _winners };
}

export function loadGetterTupleDistributeRewards(source: TupleReader) {
    const _winners = Dictionary.loadDirect(Dictionary.Keys.Address(), Dictionary.Values.BigInt(257), source.readCellOpt());
    return { $$type: 'DistributeRewards' as const, winners: _winners };
}

export function storeTupleDistributeRewards(source: DistributeRewards) {
    const builder = new TupleBuilder();
    builder.writeCell(source.winners.size > 0 ? beginCell().storeDictDirect(source.winners, Dictionary.Keys.Address(), Dictionary.Values.BigInt(257)).endCell() : null);
    return builder.build();
}

export function dictValueParserDistributeRewards(): DictionaryValue<DistributeRewards> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeDistributeRewards(src)).endCell());
        },
        parse: (src) => {
            return loadDistributeRewards(src.loadRef().beginParse());
        }
    }
}

export type CancelPool = {
    $$type: 'CancelPool';
    winners: Dictionary<Address, bigint>;
}

export function storeCancelPool(src: CancelPool) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(2782688174, 32);
        b_0.storeDict(src.winners, Dictionary.Keys.Address(), Dictionary.Values.BigInt(257));
    };
}

export function loadCancelPool(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 2782688174) { throw Error('Invalid prefix'); }
    const _winners = Dictionary.load(Dictionary.Keys.Address(), Dictionary.Values.BigInt(257), sc_0);
    return { $$type: 'CancelPool' as const, winners: _winners };
}

export function loadTupleCancelPool(source: TupleReader) {
    const _winners = Dictionary.loadDirect(Dictionary.Keys.Address(), Dictionary.Values.BigInt(257), source.readCellOpt());
    return { $$type: 'CancelPool' as const, winners: _winners };
}

export function loadGetterTupleCancelPool(source: TupleReader) {
    const _winners = Dictionary.loadDirect(Dictionary.Keys.Address(), Dictionary.Values.BigInt(257), source.readCellOpt());
    return { $$type: 'CancelPool' as const, winners: _winners };
}

export function storeTupleCancelPool(source: CancelPool) {
    const builder = new TupleBuilder();
    builder.writeCell(source.winners.size > 0 ? beginCell().storeDictDirect(source.winners, Dictionary.Keys.Address(), Dictionary.Values.BigInt(257)).endCell() : null);
    return builder.build();
}

export function dictValueParserCancelPool(): DictionaryValue<CancelPool> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeCancelPool(src)).endCell());
        },
        parse: (src) => {
            return loadCancelPool(src.loadRef().beginParse());
        }
    }
}

export type SetJettonWallet = {
    $$type: 'SetJettonWallet';
    newJettonWalletAddress: Address;
}

export function storeSetJettonWallet(src: SetJettonWallet) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(1861007543, 32);
        b_0.storeAddress(src.newJettonWalletAddress);
    };
}

export function loadSetJettonWallet(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 1861007543) { throw Error('Invalid prefix'); }
    const _newJettonWalletAddress = sc_0.loadAddress();
    return { $$type: 'SetJettonWallet' as const, newJettonWalletAddress: _newJettonWalletAddress };
}

export function loadTupleSetJettonWallet(source: TupleReader) {
    const _newJettonWalletAddress = source.readAddress();
    return { $$type: 'SetJettonWallet' as const, newJettonWalletAddress: _newJettonWalletAddress };
}

export function loadGetterTupleSetJettonWallet(source: TupleReader) {
    const _newJettonWalletAddress = source.readAddress();
    return { $$type: 'SetJettonWallet' as const, newJettonWalletAddress: _newJettonWalletAddress };
}

export function storeTupleSetJettonWallet(source: SetJettonWallet) {
    const builder = new TupleBuilder();
    builder.writeAddress(source.newJettonWalletAddress);
    return builder.build();
}

export function dictValueParserSetJettonWallet(): DictionaryValue<SetJettonWallet> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeSetJettonWallet(src)).endCell());
        },
        parse: (src) => {
            return loadSetJettonWallet(src.loadRef().beginParse());
        }
    }
}

export type AdminRescue = {
    $$type: 'AdminRescue';
    queryId: bigint;
    amount: bigint;
    destination: Address;
}

export function storeAdminRescue(src: AdminRescue) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(2892503416, 32);
        b_0.storeUint(src.queryId, 64);
        b_0.storeCoins(src.amount);
        b_0.storeAddress(src.destination);
    };
}

export function loadAdminRescue(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 2892503416) { throw Error('Invalid prefix'); }
    const _queryId = sc_0.loadUintBig(64);
    const _amount = sc_0.loadCoins();
    const _destination = sc_0.loadAddress();
    return { $$type: 'AdminRescue' as const, queryId: _queryId, amount: _amount, destination: _destination };
}

export function loadTupleAdminRescue(source: TupleReader) {
    const _queryId = source.readBigNumber();
    const _amount = source.readBigNumber();
    const _destination = source.readAddress();
    return { $$type: 'AdminRescue' as const, queryId: _queryId, amount: _amount, destination: _destination };
}

export function loadGetterTupleAdminRescue(source: TupleReader) {
    const _queryId = source.readBigNumber();
    const _amount = source.readBigNumber();
    const _destination = source.readAddress();
    return { $$type: 'AdminRescue' as const, queryId: _queryId, amount: _amount, destination: _destination };
}

export function storeTupleAdminRescue(source: AdminRescue) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.queryId);
    builder.writeNumber(source.amount);
    builder.writeAddress(source.destination);
    return builder.build();
}

export function dictValueParserAdminRescue(): DictionaryValue<AdminRescue> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeAdminRescue(src)).endCell());
        },
        parse: (src) => {
            return loadAdminRescue(src.loadRef().beginParse());
        }
    }
}

export type JettonTransfer = {
    $$type: 'JettonTransfer';
    queryId: bigint;
    amount: bigint;
    destination: Address;
    responseDestination: Address;
    customPayload: Cell | null;
    forwardTonAmount: bigint;
    forwardPayload: Slice;
}

export function storeJettonTransfer(src: JettonTransfer) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(260734629, 32);
        b_0.storeUint(src.queryId, 64);
        b_0.storeCoins(src.amount);
        b_0.storeAddress(src.destination);
        b_0.storeAddress(src.responseDestination);
        if (src.customPayload !== null && src.customPayload !== undefined) { b_0.storeBit(true).storeRef(src.customPayload); } else { b_0.storeBit(false); }
        b_0.storeCoins(src.forwardTonAmount);
        b_0.storeBuilder(src.forwardPayload.asBuilder());
    };
}

export function loadJettonTransfer(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 260734629) { throw Error('Invalid prefix'); }
    const _queryId = sc_0.loadUintBig(64);
    const _amount = sc_0.loadCoins();
    const _destination = sc_0.loadAddress();
    const _responseDestination = sc_0.loadAddress();
    const _customPayload = sc_0.loadBit() ? sc_0.loadRef() : null;
    const _forwardTonAmount = sc_0.loadCoins();
    const _forwardPayload = sc_0;
    return { $$type: 'JettonTransfer' as const, queryId: _queryId, amount: _amount, destination: _destination, responseDestination: _responseDestination, customPayload: _customPayload, forwardTonAmount: _forwardTonAmount, forwardPayload: _forwardPayload };
}

export function loadTupleJettonTransfer(source: TupleReader) {
    const _queryId = source.readBigNumber();
    const _amount = source.readBigNumber();
    const _destination = source.readAddress();
    const _responseDestination = source.readAddress();
    const _customPayload = source.readCellOpt();
    const _forwardTonAmount = source.readBigNumber();
    const _forwardPayload = source.readCell().asSlice();
    return { $$type: 'JettonTransfer' as const, queryId: _queryId, amount: _amount, destination: _destination, responseDestination: _responseDestination, customPayload: _customPayload, forwardTonAmount: _forwardTonAmount, forwardPayload: _forwardPayload };
}

export function loadGetterTupleJettonTransfer(source: TupleReader) {
    const _queryId = source.readBigNumber();
    const _amount = source.readBigNumber();
    const _destination = source.readAddress();
    const _responseDestination = source.readAddress();
    const _customPayload = source.readCellOpt();
    const _forwardTonAmount = source.readBigNumber();
    const _forwardPayload = source.readCell().asSlice();
    return { $$type: 'JettonTransfer' as const, queryId: _queryId, amount: _amount, destination: _destination, responseDestination: _responseDestination, customPayload: _customPayload, forwardTonAmount: _forwardTonAmount, forwardPayload: _forwardPayload };
}

export function storeTupleJettonTransfer(source: JettonTransfer) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.queryId);
    builder.writeNumber(source.amount);
    builder.writeAddress(source.destination);
    builder.writeAddress(source.responseDestination);
    builder.writeCell(source.customPayload);
    builder.writeNumber(source.forwardTonAmount);
    builder.writeSlice(source.forwardPayload.asCell());
    return builder.build();
}

export function dictValueParserJettonTransfer(): DictionaryValue<JettonTransfer> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeJettonTransfer(src)).endCell());
        },
        parse: (src) => {
            return loadJettonTransfer(src.loadRef().beginParse());
        }
    }
}

export type JettonTransferNotification = {
    $$type: 'JettonTransferNotification';
    queryId: bigint;
    amount: bigint;
    sender: Address;
    forwardPayload: Slice;
}

export function storeJettonTransferNotification(src: JettonTransferNotification) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(1935855772, 32);
        b_0.storeUint(src.queryId, 64);
        b_0.storeCoins(src.amount);
        b_0.storeAddress(src.sender);
        b_0.storeBuilder(src.forwardPayload.asBuilder());
    };
}

export function loadJettonTransferNotification(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 1935855772) { throw Error('Invalid prefix'); }
    const _queryId = sc_0.loadUintBig(64);
    const _amount = sc_0.loadCoins();
    const _sender = sc_0.loadAddress();
    const _forwardPayload = sc_0;
    return { $$type: 'JettonTransferNotification' as const, queryId: _queryId, amount: _amount, sender: _sender, forwardPayload: _forwardPayload };
}

export function loadTupleJettonTransferNotification(source: TupleReader) {
    const _queryId = source.readBigNumber();
    const _amount = source.readBigNumber();
    const _sender = source.readAddress();
    const _forwardPayload = source.readCell().asSlice();
    return { $$type: 'JettonTransferNotification' as const, queryId: _queryId, amount: _amount, sender: _sender, forwardPayload: _forwardPayload };
}

export function loadGetterTupleJettonTransferNotification(source: TupleReader) {
    const _queryId = source.readBigNumber();
    const _amount = source.readBigNumber();
    const _sender = source.readAddress();
    const _forwardPayload = source.readCell().asSlice();
    return { $$type: 'JettonTransferNotification' as const, queryId: _queryId, amount: _amount, sender: _sender, forwardPayload: _forwardPayload };
}

export function storeTupleJettonTransferNotification(source: JettonTransferNotification) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.queryId);
    builder.writeNumber(source.amount);
    builder.writeAddress(source.sender);
    builder.writeSlice(source.forwardPayload.asCell());
    return builder.build();
}

export function dictValueParserJettonTransferNotification(): DictionaryValue<JettonTransferNotification> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeJettonTransferNotification(src)).endCell());
        },
        parse: (src) => {
            return loadJettonTransferNotification(src.loadRef().beginParse());
        }
    }
}

export type PoolCreated = {
    $$type: 'PoolCreated';
    jettonWalletAddress: Address;
    totalReward: bigint;
    durationDays: bigint;
    rewardSlots: bigint;
    startTime: bigint;
    endTime: bigint;
}

export function storePoolCreated(src: PoolCreated) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(1127353868, 32);
        b_0.storeAddress(src.jettonWalletAddress);
        b_0.storeCoins(src.totalReward);
        b_0.storeUint(src.durationDays, 8);
        b_0.storeUint(src.rewardSlots, 8);
        b_0.storeUint(src.startTime, 64);
        b_0.storeUint(src.endTime, 64);
    };
}

export function loadPoolCreated(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 1127353868) { throw Error('Invalid prefix'); }
    const _jettonWalletAddress = sc_0.loadAddress();
    const _totalReward = sc_0.loadCoins();
    const _durationDays = sc_0.loadUintBig(8);
    const _rewardSlots = sc_0.loadUintBig(8);
    const _startTime = sc_0.loadUintBig(64);
    const _endTime = sc_0.loadUintBig(64);
    return { $$type: 'PoolCreated' as const, jettonWalletAddress: _jettonWalletAddress, totalReward: _totalReward, durationDays: _durationDays, rewardSlots: _rewardSlots, startTime: _startTime, endTime: _endTime };
}

export function loadTuplePoolCreated(source: TupleReader) {
    const _jettonWalletAddress = source.readAddress();
    const _totalReward = source.readBigNumber();
    const _durationDays = source.readBigNumber();
    const _rewardSlots = source.readBigNumber();
    const _startTime = source.readBigNumber();
    const _endTime = source.readBigNumber();
    return { $$type: 'PoolCreated' as const, jettonWalletAddress: _jettonWalletAddress, totalReward: _totalReward, durationDays: _durationDays, rewardSlots: _rewardSlots, startTime: _startTime, endTime: _endTime };
}

export function loadGetterTuplePoolCreated(source: TupleReader) {
    const _jettonWalletAddress = source.readAddress();
    const _totalReward = source.readBigNumber();
    const _durationDays = source.readBigNumber();
    const _rewardSlots = source.readBigNumber();
    const _startTime = source.readBigNumber();
    const _endTime = source.readBigNumber();
    return { $$type: 'PoolCreated' as const, jettonWalletAddress: _jettonWalletAddress, totalReward: _totalReward, durationDays: _durationDays, rewardSlots: _rewardSlots, startTime: _startTime, endTime: _endTime };
}

export function storeTuplePoolCreated(source: PoolCreated) {
    const builder = new TupleBuilder();
    builder.writeAddress(source.jettonWalletAddress);
    builder.writeNumber(source.totalReward);
    builder.writeNumber(source.durationDays);
    builder.writeNumber(source.rewardSlots);
    builder.writeNumber(source.startTime);
    builder.writeNumber(source.endTime);
    return builder.build();
}

export function dictValueParserPoolCreated(): DictionaryValue<PoolCreated> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storePoolCreated(src)).endCell());
        },
        parse: (src) => {
            return loadPoolCreated(src.loadRef().beginParse());
        }
    }
}

export type PoolEnded = {
    $$type: 'PoolEnded';
    endTime: bigint;
}

export function storePoolEnded(src: PoolEnded) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(4139807927, 32);
        b_0.storeUint(src.endTime, 64);
    };
}

export function loadPoolEnded(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 4139807927) { throw Error('Invalid prefix'); }
    const _endTime = sc_0.loadUintBig(64);
    return { $$type: 'PoolEnded' as const, endTime: _endTime };
}

export function loadTuplePoolEnded(source: TupleReader) {
    const _endTime = source.readBigNumber();
    return { $$type: 'PoolEnded' as const, endTime: _endTime };
}

export function loadGetterTuplePoolEnded(source: TupleReader) {
    const _endTime = source.readBigNumber();
    return { $$type: 'PoolEnded' as const, endTime: _endTime };
}

export function storeTuplePoolEnded(source: PoolEnded) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.endTime);
    return builder.build();
}

export function dictValueParserPoolEnded(): DictionaryValue<PoolEnded> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storePoolEnded(src)).endCell());
        },
        parse: (src) => {
            return loadPoolEnded(src.loadRef().beginParse());
        }
    }
}

export type RewardsDistributed = {
    $$type: 'RewardsDistributed';
    totalDistributed: bigint;
    winnerCount: bigint;
}

export function storeRewardsDistributed(src: RewardsDistributed) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeUint(1683337072, 32);
        b_0.storeCoins(src.totalDistributed);
        b_0.storeUint(src.winnerCount, 8);
    };
}

export function loadRewardsDistributed(slice: Slice) {
    const sc_0 = slice;
    if (sc_0.loadUint(32) !== 1683337072) { throw Error('Invalid prefix'); }
    const _totalDistributed = sc_0.loadCoins();
    const _winnerCount = sc_0.loadUintBig(8);
    return { $$type: 'RewardsDistributed' as const, totalDistributed: _totalDistributed, winnerCount: _winnerCount };
}

export function loadTupleRewardsDistributed(source: TupleReader) {
    const _totalDistributed = source.readBigNumber();
    const _winnerCount = source.readBigNumber();
    return { $$type: 'RewardsDistributed' as const, totalDistributed: _totalDistributed, winnerCount: _winnerCount };
}

export function loadGetterTupleRewardsDistributed(source: TupleReader) {
    const _totalDistributed = source.readBigNumber();
    const _winnerCount = source.readBigNumber();
    return { $$type: 'RewardsDistributed' as const, totalDistributed: _totalDistributed, winnerCount: _winnerCount };
}

export function storeTupleRewardsDistributed(source: RewardsDistributed) {
    const builder = new TupleBuilder();
    builder.writeNumber(source.totalDistributed);
    builder.writeNumber(source.winnerCount);
    return builder.build();
}

export function dictValueParserRewardsDistributed(): DictionaryValue<RewardsDistributed> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeRewardsDistributed(src)).endCell());
        },
        parse: (src) => {
            return loadRewardsDistributed(src.loadRef().beginParse());
        }
    }
}

export type PoolInfo = {
    $$type: 'PoolInfo';
    owner: Address;
    admin: Address;
    jettonWalletAddress: Address;
    totalReward: bigint;
    depositedAmount: bigint;
    durationDays: bigint;
    rewardSlots: bigint;
    startTime: bigint;
    endTime: bigint;
    status: bigint;
}

export function storePoolInfo(src: PoolInfo) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeAddress(src.owner);
        b_0.storeAddress(src.admin);
        b_0.storeAddress(src.jettonWalletAddress);
        b_0.storeCoins(src.totalReward);
        const b_1 = new Builder();
        b_1.storeCoins(src.depositedAmount);
        b_1.storeUint(src.durationDays, 8);
        b_1.storeUint(src.rewardSlots, 8);
        b_1.storeUint(src.startTime, 64);
        b_1.storeUint(src.endTime, 64);
        b_1.storeUint(src.status, 8);
        b_0.storeRef(b_1.endCell());
    };
}

export function loadPoolInfo(slice: Slice) {
    const sc_0 = slice;
    const _owner = sc_0.loadAddress();
    const _admin = sc_0.loadAddress();
    const _jettonWalletAddress = sc_0.loadAddress();
    const _totalReward = sc_0.loadCoins();
    const sc_1 = sc_0.loadRef().beginParse();
    const _depositedAmount = sc_1.loadCoins();
    const _durationDays = sc_1.loadUintBig(8);
    const _rewardSlots = sc_1.loadUintBig(8);
    const _startTime = sc_1.loadUintBig(64);
    const _endTime = sc_1.loadUintBig(64);
    const _status = sc_1.loadUintBig(8);
    return { $$type: 'PoolInfo' as const, owner: _owner, admin: _admin, jettonWalletAddress: _jettonWalletAddress, totalReward: _totalReward, depositedAmount: _depositedAmount, durationDays: _durationDays, rewardSlots: _rewardSlots, startTime: _startTime, endTime: _endTime, status: _status };
}

export function loadTuplePoolInfo(source: TupleReader) {
    const _owner = source.readAddress();
    const _admin = source.readAddress();
    const _jettonWalletAddress = source.readAddress();
    const _totalReward = source.readBigNumber();
    const _depositedAmount = source.readBigNumber();
    const _durationDays = source.readBigNumber();
    const _rewardSlots = source.readBigNumber();
    const _startTime = source.readBigNumber();
    const _endTime = source.readBigNumber();
    const _status = source.readBigNumber();
    return { $$type: 'PoolInfo' as const, owner: _owner, admin: _admin, jettonWalletAddress: _jettonWalletAddress, totalReward: _totalReward, depositedAmount: _depositedAmount, durationDays: _durationDays, rewardSlots: _rewardSlots, startTime: _startTime, endTime: _endTime, status: _status };
}

export function loadGetterTuplePoolInfo(source: TupleReader) {
    const _owner = source.readAddress();
    const _admin = source.readAddress();
    const _jettonWalletAddress = source.readAddress();
    const _totalReward = source.readBigNumber();
    const _depositedAmount = source.readBigNumber();
    const _durationDays = source.readBigNumber();
    const _rewardSlots = source.readBigNumber();
    const _startTime = source.readBigNumber();
    const _endTime = source.readBigNumber();
    const _status = source.readBigNumber();
    return { $$type: 'PoolInfo' as const, owner: _owner, admin: _admin, jettonWalletAddress: _jettonWalletAddress, totalReward: _totalReward, depositedAmount: _depositedAmount, durationDays: _durationDays, rewardSlots: _rewardSlots, startTime: _startTime, endTime: _endTime, status: _status };
}

export function storeTuplePoolInfo(source: PoolInfo) {
    const builder = new TupleBuilder();
    builder.writeAddress(source.owner);
    builder.writeAddress(source.admin);
    builder.writeAddress(source.jettonWalletAddress);
    builder.writeNumber(source.totalReward);
    builder.writeNumber(source.depositedAmount);
    builder.writeNumber(source.durationDays);
    builder.writeNumber(source.rewardSlots);
    builder.writeNumber(source.startTime);
    builder.writeNumber(source.endTime);
    builder.writeNumber(source.status);
    return builder.build();
}

export function dictValueParserPoolInfo(): DictionaryValue<PoolInfo> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storePoolInfo(src)).endCell());
        },
        parse: (src) => {
            return loadPoolInfo(src.loadRef().beginParse());
        }
    }
}

export type GramketingPool$Data = {
    $$type: 'GramketingPool$Data';
    owner: Address;
    admin: Address;
    jettonWalletAddress: Address;
    totalReward: bigint;
    durationDays: bigint;
    rewardSlots: bigint;
    startTime: bigint;
    endTime: bigint;
    status: bigint;
    depositedAmount: bigint;
}

export function storeGramketingPool$Data(src: GramketingPool$Data) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeAddress(src.owner);
        b_0.storeAddress(src.admin);
        b_0.storeAddress(src.jettonWalletAddress);
        b_0.storeCoins(src.totalReward);
        b_0.storeUint(src.durationDays, 8);
        b_0.storeUint(src.rewardSlots, 8);
        b_0.storeUint(src.startTime, 64);
        const b_1 = new Builder();
        b_1.storeUint(src.endTime, 64);
        b_1.storeUint(src.status, 8);
        b_1.storeCoins(src.depositedAmount);
        b_0.storeRef(b_1.endCell());
    };
}

export function loadGramketingPool$Data(slice: Slice) {
    const sc_0 = slice;
    const _owner = sc_0.loadAddress();
    const _admin = sc_0.loadAddress();
    const _jettonWalletAddress = sc_0.loadAddress();
    const _totalReward = sc_0.loadCoins();
    const _durationDays = sc_0.loadUintBig(8);
    const _rewardSlots = sc_0.loadUintBig(8);
    const _startTime = sc_0.loadUintBig(64);
    const sc_1 = sc_0.loadRef().beginParse();
    const _endTime = sc_1.loadUintBig(64);
    const _status = sc_1.loadUintBig(8);
    const _depositedAmount = sc_1.loadCoins();
    return { $$type: 'GramketingPool$Data' as const, owner: _owner, admin: _admin, jettonWalletAddress: _jettonWalletAddress, totalReward: _totalReward, durationDays: _durationDays, rewardSlots: _rewardSlots, startTime: _startTime, endTime: _endTime, status: _status, depositedAmount: _depositedAmount };
}

export function loadTupleGramketingPool$Data(source: TupleReader) {
    const _owner = source.readAddress();
    const _admin = source.readAddress();
    const _jettonWalletAddress = source.readAddress();
    const _totalReward = source.readBigNumber();
    const _durationDays = source.readBigNumber();
    const _rewardSlots = source.readBigNumber();
    const _startTime = source.readBigNumber();
    const _endTime = source.readBigNumber();
    const _status = source.readBigNumber();
    const _depositedAmount = source.readBigNumber();
    return { $$type: 'GramketingPool$Data' as const, owner: _owner, admin: _admin, jettonWalletAddress: _jettonWalletAddress, totalReward: _totalReward, durationDays: _durationDays, rewardSlots: _rewardSlots, startTime: _startTime, endTime: _endTime, status: _status, depositedAmount: _depositedAmount };
}

export function loadGetterTupleGramketingPool$Data(source: TupleReader) {
    const _owner = source.readAddress();
    const _admin = source.readAddress();
    const _jettonWalletAddress = source.readAddress();
    const _totalReward = source.readBigNumber();
    const _durationDays = source.readBigNumber();
    const _rewardSlots = source.readBigNumber();
    const _startTime = source.readBigNumber();
    const _endTime = source.readBigNumber();
    const _status = source.readBigNumber();
    const _depositedAmount = source.readBigNumber();
    return { $$type: 'GramketingPool$Data' as const, owner: _owner, admin: _admin, jettonWalletAddress: _jettonWalletAddress, totalReward: _totalReward, durationDays: _durationDays, rewardSlots: _rewardSlots, startTime: _startTime, endTime: _endTime, status: _status, depositedAmount: _depositedAmount };
}

export function storeTupleGramketingPool$Data(source: GramketingPool$Data) {
    const builder = new TupleBuilder();
    builder.writeAddress(source.owner);
    builder.writeAddress(source.admin);
    builder.writeAddress(source.jettonWalletAddress);
    builder.writeNumber(source.totalReward);
    builder.writeNumber(source.durationDays);
    builder.writeNumber(source.rewardSlots);
    builder.writeNumber(source.startTime);
    builder.writeNumber(source.endTime);
    builder.writeNumber(source.status);
    builder.writeNumber(source.depositedAmount);
    return builder.build();
}

export function dictValueParserGramketingPool$Data(): DictionaryValue<GramketingPool$Data> {
    return {
        serialize: (src, builder) => {
            builder.storeRef(beginCell().store(storeGramketingPool$Data(src)).endCell());
        },
        parse: (src) => {
            return loadGramketingPool$Data(src.loadRef().beginParse());
        }
    }
}

 type GramketingPool_init_args = {
    $$type: 'GramketingPool_init_args';
    owner: Address;
    admin: Address;
}

function initGramketingPool_init_args(src: GramketingPool_init_args) {
    return (builder: Builder) => {
        const b_0 = builder;
        b_0.storeAddress(src.owner);
        b_0.storeAddress(src.admin);
    };
}

async function GramketingPool_init(owner: Address, admin: Address) {
    const __code = Cell.fromHex('b5ee9c72410216010007f8000262ff008e88f4a413f4bcf2c80bed53208e9c30eda2edfb01d072d721d200d200fa4021103450666f04f86102f862e1ed43d9010301dba66815fb5134348000638a3e903e903e903e8034c1f4c1f4cff5007434cff4c1fe800c040e840e440e040dc40d840d440d1b06a38cfe903e901640b4406342180000000000000000000000000000000000000000000000000000000000000000011c151c00151c0038b6cf1b2aa0020014547987547938547a982a02eaed44d0d200018e28fa40fa40fa40fa00d307d307d33fd401d0d33fd307fa0030103a1039103810371036103510346c1a8e33fa40fa405902d1018d086000000000000000000000000000000000000000000000000000000000000000000470547000547000e20b925f0be029d749c21fe30009f901041402fe09d31f218210b112e4c5ba8eea31fa40fa00d307d3073081733af8422dc705f2f48117492dc000f2f48200d98a22c007917f9322c00ee2917f9322c015e2917f9322c01ce2f2f4820082eb21c202f2f4109b5e37106a105b104a103b4acd6c625475462af823f8232ca718a73ca73ca0103b4acd53cdc8e02182107362d09c050600cc5550821043320e0c5007cb1f15ce5003fa02cb07cb07cb3fcb3fc9c88258c000000000000000000000000101cb67ccc970fb001059104806045033074515c87f01ca005590509ace17ce15ce5003fa02cb07cb07cb3f01c8cb3f12cb0758fa02cdc9ed54db3104e6ba8e4931d33f31fa00308200f54cf84228c705f2f41aa010791068105710461035443012c87f01ca005590509ace17ce15ce5003fa02cb07cb07cb3f01c8cb3f12cb0758fa02cdc9ed54db31e0218210efc4063bbae302218210a5dc73aebae3022182106eecb8b7bae302218210ac681978ba070c101103d431f404308200a8b3f84229c705f2f4814ddf2ac001917f94f82323bce2f2f481235a0ac3021af2f47270530a81010b81010159f4826fa520965023d7003058966c216d326d01e2908ae85b3b53b0a120c2009130e30d500ac85982106455af705003cb1f01fa02cb07c9080a0b01fc52e0a8812710a9045133a002a4820afaf08072706d82089896808b08271045104a0356134133c8556082100f8a7ea55008cb1f16cb3f5004fa0212cecef40001fa02cec92c0350665a6d6d40037fc8cf8580ca00cf8440ce01fa028069cf40025c6e016eb0935bcf819d58cf8680cf8480f400f400cf81e2f400c901fb0009004081010b2d028101014133f4746fa520965023d7003058966c216d326d01e2103400e2820afaf08072716d82089896808b081034103656100356114133c8556082100f8a7ea55008cb1f16cb3f5004fa0212cecef40001fa02cec92a50335a6d6d40037fc8cf8580ca00cf8440ce01fa028069cf40025c6e016eb0935bcf819d58cf8680cf8480f400f400cf81e2f400c901fb000088c88258c000000000000000000000000101cb67ccc970fb0010795516c87f01ca005590509ace17ce15ce5003fa02cb07cb07cb3f01c8cb3f12cb0758fa02cdc9ed54db3103ee31f4043082008656f84229c705f2f481235a0ac3021af2f472702a81010b81010159f4826fa520965023d7003058966c216d326d01e2908ead52d0a8812710a90420c2009130e30d81010b2c028101014133f4746fa520965023d7003058966c216d326d01e2e85b3a52aaa120c2009130e30d107955160d0e0f00e85122a0820afaf08072706d82089896808b0827104510490356124133c8556082100f8a7ea55008cb1f16cb3f5004fa0212cecef40001fa02cec92b0350555a6d6d40037fc8cf8580ca00cf8440ce01fa028069cf40025c6e016eb0935bcf819d58cf8680cf8480f400f400cf81e2f400c901fb0000de820afaf08072716d82089896808b082e10451047513f4133c8556082100f8a7ea55008cb1f16cb3f5004fa0212cecef40001fa02cec92850335a6d6d40037fc8cf8580ca00cf8440ce01fa028069cf40025c6e016eb0935bcf819d58cf8680cf8480f400f400cf81e2f400c901fb000050c87f01ca005590509ace17ce15ce5003fa02cb07cb07cb3f01c8cb3f12cb0758fa02cdc9ed54db31008a313605fa40308200a71cf84228c705f2f4107910680710461035443012c87f01ca005590509ace17ce15ce5003fa02cb07cb07cb3f01c8cb3f12cb0758fa02cdc9ed54db3101f2e302018210946a98b6ba8e6bd33f30c8018210aff90f5758cb1fcb3fc9108a10791068105710461035443012f84270705003804201503304c8cf8580ca00cf8440ce01fa02806acf40f400c901fb00c87f01ca005590509ace17ce15ce5003fa02cb07cb07cb3f01c8cb3f12cb0758fa02cdc9ed54db31e0091201fc31d33ffa00fa4030812eb5f8422bc705f2f4820afaf080726d82089896808b0810575e332e5520c8556082100f8a7ea55008cb1f16cb3f5004fa0212cecef40001fa02cec92850335a6d6d40037fc8cf8580ca00cf8440ce01fa028069cf40025c6e016eb0935bcf819d58cf8680cf8480f400f400cf81e2f400c901fb0013005810795516c87f01ca005590509ace17ce15ce5003fa02cb07cb07cb3f01c8cb3f12cb0758fa02cdc9ed54db31015482f0308fb107779030082ad974039ec4ac023028bcf2ca85833b6c93e8592bed6b36bae3025f0af2c0821500e08200cd92f84228c705f2f48200d21609c00019f2f471f823c8018210f6c074b758cb1fcb3fc9c88258c000000000000000000000000101cb67ccc970fb00107910681057104610354403c87f01ca005590509ace17ce15ce5003fa02cb07cb07cb3f01c8cb3f12cb0758fa02cdc9ed54c723947c');
    const builder = beginCell();
    builder.storeUint(0, 1);
    initGramketingPool_init_args({ $$type: 'GramketingPool_init_args', owner, admin })(builder);
    const __data = builder.endCell();
    return { code: __code, data: __data };
}

export const GramketingPool_errors = {
    2: { message: "Stack underflow" },
    3: { message: "Stack overflow" },
    4: { message: "Integer overflow" },
    5: { message: "Integer out of expected range" },
    6: { message: "Invalid opcode" },
    7: { message: "Type check error" },
    8: { message: "Cell overflow" },
    9: { message: "Cell underflow" },
    10: { message: "Dictionary error" },
    11: { message: "'Unknown' error" },
    12: { message: "Fatal error" },
    13: { message: "Out of gas error" },
    14: { message: "Virtualization error" },
    32: { message: "Action list is invalid" },
    33: { message: "Action list is too long" },
    34: { message: "Action is invalid or not supported" },
    35: { message: "Invalid source address in outbound message" },
    36: { message: "Invalid destination address in outbound message" },
    37: { message: "Not enough Toncoin" },
    38: { message: "Not enough extra currencies" },
    39: { message: "Outbound message does not fit into a cell after rewriting" },
    40: { message: "Cannot process a message" },
    41: { message: "Library reference is null" },
    42: { message: "Library change action error" },
    43: { message: "Exceeded maximum number of cells in the library or the maximum depth of the Merkle tree" },
    50: { message: "Account state size exceeded limits" },
    128: { message: "Null reference exception" },
    129: { message: "Invalid serialization prefix" },
    130: { message: "Invalid incoming message" },
    131: { message: "Constraints error" },
    132: { message: "Access denied" },
    133: { message: "Contract stopped" },
    134: { message: "Invalid argument" },
    135: { message: "Code of a contract was not found" },
    136: { message: "Invalid standard address" },
    138: { message: "Not a basechain address" },
    5961: { message: "Pool already initialized" },
    9050: { message: "Already distributed" },
    11957: { message: "Only admin can rescue tokens" },
    19935: { message: "Pool not ended yet" },
    29498: { message: "Only owner can create pool" },
    33515: { message: "Minimum 3 reward slots required" },
    34390: { message: "Only admin can cancel pool" },
    42780: { message: "Only admin can set jetton wallet" },
    43187: { message: "Only admin can distribute rewards" },
    52626: { message: "Only admin can end pool" },
    53782: { message: "Pool not active" },
    55690: { message: "Duration must be 7, 14, 21, or 28 days" },
    62796: { message: "Only jetton wallet can notify" },
} as const

export const GramketingPool_errors_backward = {
    "Stack underflow": 2,
    "Stack overflow": 3,
    "Integer overflow": 4,
    "Integer out of expected range": 5,
    "Invalid opcode": 6,
    "Type check error": 7,
    "Cell overflow": 8,
    "Cell underflow": 9,
    "Dictionary error": 10,
    "'Unknown' error": 11,
    "Fatal error": 12,
    "Out of gas error": 13,
    "Virtualization error": 14,
    "Action list is invalid": 32,
    "Action list is too long": 33,
    "Action is invalid or not supported": 34,
    "Invalid source address in outbound message": 35,
    "Invalid destination address in outbound message": 36,
    "Not enough Toncoin": 37,
    "Not enough extra currencies": 38,
    "Outbound message does not fit into a cell after rewriting": 39,
    "Cannot process a message": 40,
    "Library reference is null": 41,
    "Library change action error": 42,
    "Exceeded maximum number of cells in the library or the maximum depth of the Merkle tree": 43,
    "Account state size exceeded limits": 50,
    "Null reference exception": 128,
    "Invalid serialization prefix": 129,
    "Invalid incoming message": 130,
    "Constraints error": 131,
    "Access denied": 132,
    "Contract stopped": 133,
    "Invalid argument": 134,
    "Code of a contract was not found": 135,
    "Invalid standard address": 136,
    "Not a basechain address": 138,
    "Pool already initialized": 5961,
    "Already distributed": 9050,
    "Only admin can rescue tokens": 11957,
    "Pool not ended yet": 19935,
    "Only owner can create pool": 29498,
    "Minimum 3 reward slots required": 33515,
    "Only admin can cancel pool": 34390,
    "Only admin can set jetton wallet": 42780,
    "Only admin can distribute rewards": 43187,
    "Only admin can end pool": 52626,
    "Pool not active": 53782,
    "Duration must be 7, 14, 21, or 28 days": 55690,
    "Only jetton wallet can notify": 62796,
} as const

const GramketingPool_types: ABIType[] = [
    {"name":"DataSize","header":null,"fields":[{"name":"cells","type":{"kind":"simple","type":"int","optional":false,"format":257}},{"name":"bits","type":{"kind":"simple","type":"int","optional":false,"format":257}},{"name":"refs","type":{"kind":"simple","type":"int","optional":false,"format":257}}]},
    {"name":"SignedBundle","header":null,"fields":[{"name":"signature","type":{"kind":"simple","type":"fixed-bytes","optional":false,"format":64}},{"name":"signedData","type":{"kind":"simple","type":"slice","optional":false,"format":"remainder"}}]},
    {"name":"StateInit","header":null,"fields":[{"name":"code","type":{"kind":"simple","type":"cell","optional":false}},{"name":"data","type":{"kind":"simple","type":"cell","optional":false}}]},
    {"name":"Context","header":null,"fields":[{"name":"bounceable","type":{"kind":"simple","type":"bool","optional":false}},{"name":"sender","type":{"kind":"simple","type":"address","optional":false}},{"name":"value","type":{"kind":"simple","type":"int","optional":false,"format":257}},{"name":"raw","type":{"kind":"simple","type":"slice","optional":false}}]},
    {"name":"SendParameters","header":null,"fields":[{"name":"mode","type":{"kind":"simple","type":"int","optional":false,"format":257}},{"name":"body","type":{"kind":"simple","type":"cell","optional":true}},{"name":"code","type":{"kind":"simple","type":"cell","optional":true}},{"name":"data","type":{"kind":"simple","type":"cell","optional":true}},{"name":"value","type":{"kind":"simple","type":"int","optional":false,"format":257}},{"name":"to","type":{"kind":"simple","type":"address","optional":false}},{"name":"bounce","type":{"kind":"simple","type":"bool","optional":false}}]},
    {"name":"MessageParameters","header":null,"fields":[{"name":"mode","type":{"kind":"simple","type":"int","optional":false,"format":257}},{"name":"body","type":{"kind":"simple","type":"cell","optional":true}},{"name":"value","type":{"kind":"simple","type":"int","optional":false,"format":257}},{"name":"to","type":{"kind":"simple","type":"address","optional":false}},{"name":"bounce","type":{"kind":"simple","type":"bool","optional":false}}]},
    {"name":"DeployParameters","header":null,"fields":[{"name":"mode","type":{"kind":"simple","type":"int","optional":false,"format":257}},{"name":"body","type":{"kind":"simple","type":"cell","optional":true}},{"name":"value","type":{"kind":"simple","type":"int","optional":false,"format":257}},{"name":"bounce","type":{"kind":"simple","type":"bool","optional":false}},{"name":"init","type":{"kind":"simple","type":"StateInit","optional":false}}]},
    {"name":"StdAddress","header":null,"fields":[{"name":"workchain","type":{"kind":"simple","type":"int","optional":false,"format":8}},{"name":"address","type":{"kind":"simple","type":"uint","optional":false,"format":256}}]},
    {"name":"VarAddress","header":null,"fields":[{"name":"workchain","type":{"kind":"simple","type":"int","optional":false,"format":32}},{"name":"address","type":{"kind":"simple","type":"slice","optional":false}}]},
    {"name":"BasechainAddress","header":null,"fields":[{"name":"hash","type":{"kind":"simple","type":"int","optional":true,"format":257}}]},
    {"name":"Deploy","header":2490013878,"fields":[{"name":"queryId","type":{"kind":"simple","type":"uint","optional":false,"format":64}}]},
    {"name":"DeployOk","header":2952335191,"fields":[{"name":"queryId","type":{"kind":"simple","type":"uint","optional":false,"format":64}}]},
    {"name":"FactoryDeploy","header":1829761339,"fields":[{"name":"queryId","type":{"kind":"simple","type":"uint","optional":false,"format":64}},{"name":"cashback","type":{"kind":"simple","type":"address","optional":false}}]},
    {"name":"CreatePool","header":2970805445,"fields":[{"name":"jettonWalletAddress","type":{"kind":"simple","type":"address","optional":false}},{"name":"totalReward","type":{"kind":"simple","type":"uint","optional":false,"format":"coins"}},{"name":"durationDays","type":{"kind":"simple","type":"uint","optional":false,"format":8}},{"name":"rewardSlots","type":{"kind":"simple","type":"uint","optional":false,"format":8}}]},
    {"name":"DistributeRewards","header":4022601275,"fields":[{"name":"winners","type":{"kind":"dict","key":"address","value":"int"}}]},
    {"name":"CancelPool","header":2782688174,"fields":[{"name":"winners","type":{"kind":"dict","key":"address","value":"int"}}]},
    {"name":"SetJettonWallet","header":1861007543,"fields":[{"name":"newJettonWalletAddress","type":{"kind":"simple","type":"address","optional":false}}]},
    {"name":"AdminRescue","header":2892503416,"fields":[{"name":"queryId","type":{"kind":"simple","type":"uint","optional":false,"format":64}},{"name":"amount","type":{"kind":"simple","type":"uint","optional":false,"format":"coins"}},{"name":"destination","type":{"kind":"simple","type":"address","optional":false}}]},
    {"name":"JettonTransfer","header":260734629,"fields":[{"name":"queryId","type":{"kind":"simple","type":"uint","optional":false,"format":64}},{"name":"amount","type":{"kind":"simple","type":"uint","optional":false,"format":"coins"}},{"name":"destination","type":{"kind":"simple","type":"address","optional":false}},{"name":"responseDestination","type":{"kind":"simple","type":"address","optional":false}},{"name":"customPayload","type":{"kind":"simple","type":"cell","optional":true}},{"name":"forwardTonAmount","type":{"kind":"simple","type":"uint","optional":false,"format":"coins"}},{"name":"forwardPayload","type":{"kind":"simple","type":"slice","optional":false,"format":"remainder"}}]},
    {"name":"JettonTransferNotification","header":1935855772,"fields":[{"name":"queryId","type":{"kind":"simple","type":"uint","optional":false,"format":64}},{"name":"amount","type":{"kind":"simple","type":"uint","optional":false,"format":"coins"}},{"name":"sender","type":{"kind":"simple","type":"address","optional":false}},{"name":"forwardPayload","type":{"kind":"simple","type":"slice","optional":false,"format":"remainder"}}]},
    {"name":"PoolCreated","header":1127353868,"fields":[{"name":"jettonWalletAddress","type":{"kind":"simple","type":"address","optional":false}},{"name":"totalReward","type":{"kind":"simple","type":"uint","optional":false,"format":"coins"}},{"name":"durationDays","type":{"kind":"simple","type":"uint","optional":false,"format":8}},{"name":"rewardSlots","type":{"kind":"simple","type":"uint","optional":false,"format":8}},{"name":"startTime","type":{"kind":"simple","type":"uint","optional":false,"format":64}},{"name":"endTime","type":{"kind":"simple","type":"uint","optional":false,"format":64}}]},
    {"name":"PoolEnded","header":4139807927,"fields":[{"name":"endTime","type":{"kind":"simple","type":"uint","optional":false,"format":64}}]},
    {"name":"RewardsDistributed","header":1683337072,"fields":[{"name":"totalDistributed","type":{"kind":"simple","type":"uint","optional":false,"format":"coins"}},{"name":"winnerCount","type":{"kind":"simple","type":"uint","optional":false,"format":8}}]},
    {"name":"PoolInfo","header":null,"fields":[{"name":"owner","type":{"kind":"simple","type":"address","optional":false}},{"name":"admin","type":{"kind":"simple","type":"address","optional":false}},{"name":"jettonWalletAddress","type":{"kind":"simple","type":"address","optional":false}},{"name":"totalReward","type":{"kind":"simple","type":"uint","optional":false,"format":"coins"}},{"name":"depositedAmount","type":{"kind":"simple","type":"uint","optional":false,"format":"coins"}},{"name":"durationDays","type":{"kind":"simple","type":"uint","optional":false,"format":8}},{"name":"rewardSlots","type":{"kind":"simple","type":"uint","optional":false,"format":8}},{"name":"startTime","type":{"kind":"simple","type":"uint","optional":false,"format":64}},{"name":"endTime","type":{"kind":"simple","type":"uint","optional":false,"format":64}},{"name":"status","type":{"kind":"simple","type":"uint","optional":false,"format":8}}]},
    {"name":"GramketingPool$Data","header":null,"fields":[{"name":"owner","type":{"kind":"simple","type":"address","optional":false}},{"name":"admin","type":{"kind":"simple","type":"address","optional":false}},{"name":"jettonWalletAddress","type":{"kind":"simple","type":"address","optional":false}},{"name":"totalReward","type":{"kind":"simple","type":"uint","optional":false,"format":"coins"}},{"name":"durationDays","type":{"kind":"simple","type":"uint","optional":false,"format":8}},{"name":"rewardSlots","type":{"kind":"simple","type":"uint","optional":false,"format":8}},{"name":"startTime","type":{"kind":"simple","type":"uint","optional":false,"format":64}},{"name":"endTime","type":{"kind":"simple","type":"uint","optional":false,"format":64}},{"name":"status","type":{"kind":"simple","type":"uint","optional":false,"format":8}},{"name":"depositedAmount","type":{"kind":"simple","type":"uint","optional":false,"format":"coins"}}]},
]

const GramketingPool_opcodes = {
    "Deploy": 2490013878,
    "DeployOk": 2952335191,
    "FactoryDeploy": 1829761339,
    "CreatePool": 2970805445,
    "DistributeRewards": 4022601275,
    "CancelPool": 2782688174,
    "SetJettonWallet": 1861007543,
    "AdminRescue": 2892503416,
    "JettonTransfer": 260734629,
    "JettonTransferNotification": 1935855772,
    "PoolCreated": 1127353868,
    "PoolEnded": 4139807927,
    "RewardsDistributed": 1683337072,
}

const GramketingPool_getters: ABIGetter[] = [
    {"name":"poolInfo","methodId":106583,"arguments":[],"returnType":{"kind":"simple","type":"PoolInfo","optional":false}},
]

export const GramketingPool_getterMapping: { [key: string]: string } = {
    'poolInfo': 'getPoolInfo',
}

const GramketingPool_receivers: ABIReceiver[] = [
    {"receiver":"internal","message":{"kind":"typed","type":"CreatePool"}},
    {"receiver":"internal","message":{"kind":"typed","type":"JettonTransferNotification"}},
    {"receiver":"internal","message":{"kind":"typed","type":"DistributeRewards"}},
    {"receiver":"internal","message":{"kind":"text","text":"endPool"}},
    {"receiver":"internal","message":{"kind":"typed","type":"CancelPool"}},
    {"receiver":"internal","message":{"kind":"typed","type":"SetJettonWallet"}},
    {"receiver":"internal","message":{"kind":"typed","type":"AdminRescue"}},
    {"receiver":"internal","message":{"kind":"typed","type":"Deploy"}},
]

export const POOL_ACTIVE = 0n;
export const POOL_ENDED = 1n;
export const POOL_DISTRIBUTED = 2n;

export class GramketingPool implements Contract {
    
    public static readonly storageReserve = 0n;
    public static readonly errors = GramketingPool_errors_backward;
    public static readonly opcodes = GramketingPool_opcodes;
    
    static async init(owner: Address, admin: Address) {
        return await GramketingPool_init(owner, admin);
    }
    
    static async fromInit(owner: Address, admin: Address) {
        const __gen_init = await GramketingPool_init(owner, admin);
        const address = contractAddress(0, __gen_init);
        return new GramketingPool(address, __gen_init);
    }
    
    static fromAddress(address: Address) {
        return new GramketingPool(address);
    }
    
    readonly address: Address; 
    readonly init?: { code: Cell, data: Cell };
    readonly abi: ContractABI = {
        types:  GramketingPool_types,
        getters: GramketingPool_getters,
        receivers: GramketingPool_receivers,
        errors: GramketingPool_errors,
    };
    
    constructor(address: Address, init?: { code: Cell, data: Cell }) {
        this.address = address;
        this.init = init;
    }
    
    async send(provider: ContractProvider, via: Sender, args: { value: bigint, bounce?: boolean| null | undefined }, message: CreatePool | JettonTransferNotification | DistributeRewards | "endPool" | CancelPool | SetJettonWallet | AdminRescue | Deploy) {
        
        let body: Cell | null = null;
        if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'CreatePool') {
            body = beginCell().store(storeCreatePool(message)).endCell();
        }
        if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'JettonTransferNotification') {
            body = beginCell().store(storeJettonTransferNotification(message)).endCell();
        }
        if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'DistributeRewards') {
            body = beginCell().store(storeDistributeRewards(message)).endCell();
        }
        if (message === "endPool") {
            body = beginCell().storeUint(0, 32).storeStringTail(message).endCell();
        }
        if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'CancelPool') {
            body = beginCell().store(storeCancelPool(message)).endCell();
        }
        if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'SetJettonWallet') {
            body = beginCell().store(storeSetJettonWallet(message)).endCell();
        }
        if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'AdminRescue') {
            body = beginCell().store(storeAdminRescue(message)).endCell();
        }
        if (message && typeof message === 'object' && !(message instanceof Slice) && message.$$type === 'Deploy') {
            body = beginCell().store(storeDeploy(message)).endCell();
        }
        if (body === null) { throw new Error('Invalid message type'); }
        
        await provider.internal(via, { ...args, body: body });
        
    }
    
    async getPoolInfo(provider: ContractProvider) {
        const builder = new TupleBuilder();
        const source = (await provider.get('poolInfo', builder.build())).stack;
        const result = loadGetterTuplePoolInfo(source);
        return result;
    }
    
}