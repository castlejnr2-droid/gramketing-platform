import "@stdlib/deploy";

// Pool states
const POOL_ACTIVE: Int = 0;
const POOL_ENDED: Int = 1;
const POOL_DISTRIBUTED: Int = 2;

// Message opcodes
message CreatePool {
    jettonWalletAddress: Address;
    totalReward: Int as coins;
    durationDays: Int as uint8;
    rewardSlots: Int as uint8;
}

message DistributeRewards {
    winners: map<Address, Int>; // address -> sharePercent (basis points, sum = 10000)
}

// Pro-rata cancellation: basis points sum to (daysElapsed/durationDays * 10000),
// remainder is automatically refunded to owner.
message CancelPool {
    winners: map<Address, Int>; // address -> shareBasisPoints (sum ≤ 10000)
}

// Admin can correct the jetton wallet address (e.g. after redeployment or wrong placeholder)
message SetJettonWallet {
    newJettonWalletAddress: Address;
}

// Admin emergency rescue: transfer any amount from contract's jetton wallet to any address
message AdminRescue {
    queryId: Int as uint64;
    amount: Int as coins;
    destination: Address;
}

// TEP-74 standard jetton transfer opcode: 0x0f8a7ea5
message(0x0f8a7ea5) JettonTransfer {
    queryId: Int as uint64;
    amount: Int as coins;
    destination: Address;
    responseDestination: Address;
    customPayload: Cell?;
    forwardTonAmount: Int as coins;
    forwardPayload: Slice as remaining;
}

// TEP-74 standard jetton transfer_notification opcode: 0x7362d09c
message(0x7362d09c) JettonTransferNotification {
    queryId: Int as uint64;
    amount: Int as coins;
    sender: Address;
    forwardPayload: Slice as remaining;
}

// Events
message PoolCreated {
    jettonWalletAddress: Address;
    totalReward: Int as coins;
    durationDays: Int as uint8;
    rewardSlots: Int as uint8;
    startTime: Int as uint64;
    endTime: Int as uint64;
}

message PoolEnded {
    endTime: Int as uint64;
}

message RewardsDistributed {
    totalDistributed: Int as coins;
    winnerCount: Int as uint8;
}

struct PoolInfo {
    owner: Address;
    admin: Address;
    jettonWalletAddress: Address;
    totalReward: Int as coins;
    depositedAmount: Int as coins;
    durationDays: Int as uint8;
    rewardSlots: Int as uint8;
    startTime: Int as uint64;
    endTime: Int as uint64;
    status: Int as uint8;
}

contract GramketingPool with Deployable {
    owner: Address;          // project owner
    admin: Address;          // platform admin wallet
    jettonWalletAddress: Address;
    totalReward: Int as coins;
    durationDays: Int as uint8;
    rewardSlots: Int as uint8;
    startTime: Int as uint64;
    endTime: Int as uint64;
    status: Int as uint8;    // 0=ACTIVE, 1=ENDED, 2=DISTRIBUTED
    depositedAmount: Int as coins;

    init(owner: Address, admin: Address) {
        self.owner = owner;
        self.admin = admin;
        self.jettonWalletAddress = newAddress(0, 0);
        self.totalReward = 0;
        self.durationDays = 0;
        self.rewardSlots = 0;
        self.startTime = 0;
        self.endTime = 0;
        self.status = POOL_ACTIVE;
        self.depositedAmount = 0;
    }

    // TODO: gate pool creation on $mGRAM token balance.
    // When $mGRAM jetton is deployed, verify project owner holds
    // minimum required $mGRAM before allowing pool creation.
    // Set MGRAM_JETTON_MASTER_ADDRESS and MGRAM_MINIMUM_HOLDING in env.
    fun requirePlatformToken() {
        // Stub: always passes until $mGRAM is deployed
        // Future: check sender holds MGRAM_MINIMUM_HOLDING of $mGRAM jetton
    }

    receive(msg: CreatePool) {
        require(sender() == self.owner, "Only owner can create pool");
        require(self.status == POOL_ACTIVE, "Pool already initialized");
        require(
            msg.durationDays == 7 || msg.durationDays == 14 ||
            msg.durationDays == 21 || msg.durationDays == 28,
            "Duration must be 7, 14, 21, or 28 days"
        );
        require(msg.rewardSlots >= 3, "Minimum 3 reward slots required");

        self.requirePlatformToken();

        self.jettonWalletAddress = msg.jettonWalletAddress;
        self.totalReward = msg.totalReward;
        self.durationDays = msg.durationDays;
        self.rewardSlots = msg.rewardSlots;
        self.startTime = now();
        self.endTime = now() + (msg.durationDays * 24 * 60 * 60);

        emit(PoolCreated{
            jettonWalletAddress: msg.jettonWalletAddress,
            totalReward: msg.totalReward,
            durationDays: msg.durationDays,
            rewardSlots: msg.rewardSlots,
            startTime: self.startTime,
            endTime: self.endTime
        }.toCell());
    }

    // Receive jetton deposit notification
    receive(msg: JettonTransferNotification) {
        require(sender() == self.jettonWalletAddress, "Only jetton wallet can notify");
        self.depositedAmount = self.depositedAmount + msg.amount;
    }

    receive(msg: DistributeRewards) {
        require(sender() == self.admin, "Only admin can distribute rewards");
        require(self.status == POOL_ENDED || now() > self.endTime, "Pool not ended yet");
        require(self.status != POOL_DISTRIBUTED, "Already distributed");

        self.status = POOL_DISTRIBUTED;

        let totalDistributed: Int = 0;
        let winnerCount: Int = 0;

        // Iterate winners map and send jetton transfers
        foreach(addr, shareBasisPoints in msg.winners) {
            let amount: Int = self.depositedAmount * shareBasisPoints / 10000;
            totalDistributed = totalDistributed + amount;
            winnerCount = winnerCount + 1;

            // Send jetton to winner via jetton wallet
            send(SendParameters{
                to: self.jettonWalletAddress,
                value: ton("0.15"),
                mode: SendIgnoreErrors,
                body: JettonTransfer{
                    queryId: 0,
                    amount: amount,
                    destination: addr,
                    responseDestination: self.owner,
                    customPayload: null,
                    forwardTonAmount: ton("0.01"),
                    // Either discriminant bit (0 = inline) required by TEP-74 before payload
                    forwardPayload: beginCell().storeBit(false).endCell().asSlice()
                }.toCell()
            });
        }

        // Return dust to project owner
        let dust: Int = self.depositedAmount - totalDistributed;
        if (dust > 0) {
            send(SendParameters{
                to: self.jettonWalletAddress,
                value: ton("0.15"),
                mode: SendIgnoreErrors,
                body: JettonTransfer{
                    queryId: 1,
                    amount: dust,
                    destination: self.owner,
                    responseDestination: self.owner,
                    customPayload: null,
                    forwardTonAmount: ton("0.01"),
                    // Either discriminant bit (0 = inline) required by TEP-74 before payload
                    forwardPayload: beginCell().storeBit(false).endCell().asSlice()
                }.toCell()
            });
        }

        emit(RewardsDistributed{
            totalDistributed: totalDistributed,
            winnerCount: winnerCount
        }.toCell());
    }

    // Admin can mark pool as ended
    receive("endPool") {
        require(sender() == self.admin, "Only admin can end pool");
        require(self.status == POOL_ACTIVE, "Pool not active");
        self.status = POOL_ENDED;
        emit(PoolEnded{ endTime: now() }.toCell());
    }

    // Admin cancels pool with pro-rata split.
    // Winners receive (depositedAmount * shareBasisPoints / 10000) each.
    // The remainder (project owner's pro-rata refund + rounding dust) is returned to owner.
    receive(msg: CancelPool) {
        require(sender() == self.admin, "Only admin can cancel pool");
        require(self.status != POOL_DISTRIBUTED, "Already distributed");

        self.status = POOL_DISTRIBUTED;

        let totalDistributed: Int = 0;

        foreach(addr, shareBasisPoints in msg.winners) {
            let amount: Int = self.depositedAmount * shareBasisPoints / 10000;
            if (amount > 0) {
                totalDistributed = totalDistributed + amount;
                send(SendParameters{
                    to: self.jettonWalletAddress,
                    value: ton("0.15"),
                    mode: SendIgnoreErrors,
                    body: JettonTransfer{
                        queryId: 0,
                        amount: amount,
                        destination: addr,
                        responseDestination: self.owner,
                        customPayload: null,
                        forwardTonAmount: ton("0.01"),
                        // Either discriminant bit (0 = inline) required by TEP-74 before payload
                        forwardPayload: beginCell().storeBit(false).endCell().asSlice()
                    }.toCell()
                });
            }
        }

        // Refund the project owner's pro-rata share (plus any rounding dust)
        let refund: Int = self.depositedAmount - totalDistributed;
        if (refund > 0) {
            send(SendParameters{
                to: self.jettonWalletAddress,
                value: ton("0.15"),
                mode: SendIgnoreErrors,
                body: JettonTransfer{
                    queryId: 1,
                    amount: refund,
                    destination: self.owner,
                    responseDestination: self.owner,
                    customPayload: null,
                    forwardTonAmount: ton("0.01"),
                    // Either discriminant bit (0 = inline) required by TEP-74 before payload
                    forwardPayload: beginCell().storeBit(false).endCell().asSlice()
                }.toCell()
            });
        }
    }

    // Admin can update the jetton wallet address (e.g. to correct a placeholder set at init)
    receive(msg: SetJettonWallet) {
        require(sender() == self.admin, "Only admin can set jetton wallet");
        self.jettonWalletAddress = msg.newJettonWalletAddress;
    }

    // Emergency rescue: admin can move jettons out of the contract to any address.
    // Use this if tokens land in the contract's jetton wallet but depositedAmount = 0,
    // or if distribution needs to be manually completed after a partial failure.
    receive(msg: AdminRescue) {
        require(sender() == self.admin, "Only admin can rescue tokens");
        send(SendParameters{
            to: self.jettonWalletAddress,
            value: ton("0.3"),
            mode: SendRemainingBalance,
            body: JettonTransfer{
                queryId: msg.queryId,
                amount: msg.amount,
                destination: msg.destination,
                responseDestination: self.admin,
                customPayload: null,
                forwardTonAmount: ton("0.01"),
                // Either discriminant bit (0 = inline) required by TEP-74 before payload
                forwardPayload: beginCell().storeBit(false).endCell().asSlice()
            }.toCell()
        });
    }

    get fun poolInfo(): PoolInfo {
        return PoolInfo{
            owner: self.owner,
            admin: self.admin,
            jettonWalletAddress: self.jettonWalletAddress,
            totalReward: self.totalReward,
            depositedAmount: self.depositedAmount,
            durationDays: self.durationDays,
            rewardSlots: self.rewardSlots,
            startTime: self.startTime,
            endTime: self.endTime,
            status: self.status
        };
    }
}
