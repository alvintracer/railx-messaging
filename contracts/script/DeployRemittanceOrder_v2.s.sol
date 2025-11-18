// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/RemittanceOrder721.sol";
import "../src/BankRegistry.sol";

contract DeployRemittanceOrderV2 is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);

        // Deploy RemittanceOrder
        RemittanceOrder721 remit = new RemittanceOrder721();

        // Deploy BankRegistry
        BankRegistry registry = new BankRegistry(address(remit));

        vm.stopBroadcast();

        console2.log("RemittanceOrder721_v2 deployed:", address(remit));
        console2.log("BankRegistry deployed:", address(registry));
    }
}