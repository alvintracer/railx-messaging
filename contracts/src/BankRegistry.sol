// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";

interface IRemittanceOrder721 {
    function grantRole(bytes32 role, address account) external;
    function BANK_ROLE() external view returns (bytes32);
}

contract BankRegistry is AccessControl {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    mapping(bytes32 => address) public bankCodeToAddress;
    bytes32[] public bankCodes;

    IRemittanceOrder721 public remittance;

    event BankRegistered(bytes32 indexed bankCode, address indexed bankAddress);
    event BankRemoved(bytes32 indexed bankCode);

    constructor(address remittanceAddress) {
        remittance = IRemittanceOrder721(remittanceAddress);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }

    function registerBank(string calldata code, address bankAddr)
        external
        onlyRole(ADMIN_ROLE)
    {
        bytes32 bankCode = keccak256(bytes(code));
        require(bankCodeToAddress[bankCode] == address(0), "bank exists");

        bankCodeToAddress[bankCode] = bankAddr;
        bankCodes.push(bankCode);

        // Grant BANK_ROLE to this bank
        remittance.grantRole(remittance.BANK_ROLE(), bankAddr);

        emit BankRegistered(bankCode, bankAddr);
    }

    function removeBank(string calldata code)
        external
        onlyRole(ADMIN_ROLE)
    {
        bytes32 bankCode = keccak256(bytes(code));
        require(bankCodeToAddress[bankCode] != address(0), "bank not found");

        delete bankCodeToAddress[bankCode];

        emit BankRemoved(bankCode);
    }

    function resolveBank(string calldata code)
        external
        view
        returns (address)
    {
        return bankCodeToAddress[keccak256(bytes(code))];
    }
}