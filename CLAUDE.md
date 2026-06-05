# Claude Code Rules — gramketing-platform

## Smart Contract Rules (TON/Tact, Solidity, or any chain)

NEVER deploy any smart contract without first:

1. Printing the complete list of all functions in the contract
2. Confirming ALL of the following are present:
   - Core business logic functions
   - Admin/owner access control on all sensitive functions
   - Emergency rescue or withdrawal function (admin can recover stuck funds/tokens)
   - Any chain-specific requirements (e.g. jetton wallet address setter for TON)
3. Checking all hardcoded addresses are real verified addresses (not placeholders or test values)
4. Checking the deployer wallet has sufficient gas/TON/ETH for deployment + operations
5. Running a full audit summary — list any missing functions, risks, or unknowns
6. Waiting for the user to explicitly type "yes deploy" before proceeding

This rule applies to ALL deployments: new contracts, redeployments, upgrades, and test deployments on any network including mainnet, testnet, and local.

If any checklist item is unclear or missing, STOP and ask before proceeding.
