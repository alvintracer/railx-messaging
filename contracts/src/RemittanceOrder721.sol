// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract RemittanceOrder721 is ERC721, AccessControl {
    bytes32 public constant BANK_ROLE = keccak256("BANK_ROLE");

    enum Status { REQUESTED, APPROVED, SETTLED, CANCELED }

    struct Order {
        bytes32 metaHash;        // 홍-P 파일 전체 해시
        bytes32 encKeyWrapHash;  // encrypted AES key 해시
        uint256 amountKRW;
        address srcBank;
        address dstBank;
        uint64  createdAt;
        uint64  expiry;
        Status  status;
    }

    mapping(uint256 => Order) public orders;
    uint256 public nextId;

    event OrderRequested(uint256 indexed tokenId, address indexed srcBank, address indexed dstBank);
    event OrderApproved(uint256 indexed tokenId, address indexed bank);
    event OrderSettled(uint256 indexed tokenId, address indexed bank);
    event OrderCanceled(uint256 indexed tokenId, address indexed bank);

    constructor() ERC721("RailX Remittance Order", "RXRO") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(ERC721, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function requestOrder(
        bytes32 metaHash,
        bytes32 encKeyWrapHash,
        uint256 amountKRW,
        address dstBank,
        uint64 expiry
    ) external onlyRole(BANK_ROLE) returns (uint256) {
        uint256 tokenId = ++nextId;
        _safeMint(dstBank, tokenId);

        orders[tokenId] = Order({
            metaHash: metaHash,
            encKeyWrapHash: encKeyWrapHash,
            amountKRW: amountKRW,
            srcBank: msg.sender,
            dstBank: dstBank,
            createdAt: uint64(block.timestamp),
            expiry: expiry,
            status: Status.REQUESTED
        });

        emit OrderRequested(tokenId, msg.sender, dstBank);
        return tokenId;
    }

    function approveOrder(uint256 tokenId, bytes calldata proofAttestation)
        external
        onlyRole(BANK_ROLE)
    {
        Order storage o = orders[tokenId];
        require(msg.sender == o.dstBank, "not dstBank");
        require(o.status == Status.REQUESTED, "invalid state");
        require(block.timestamp <= o.expiry, "expired");

        // TODO: proofAttestation (ZKP 검증 결과에 대한 서명 등) 검증 로직

        o.status = Status.APPROVED;
        emit OrderApproved(tokenId, msg.sender);
    }

    function settleOrder(uint256 tokenId) external onlyRole(BANK_ROLE) {
        Order storage o = orders[tokenId];
        require(o.status == Status.APPROVED, "not approved");

        o.status = Status.SETTLED;
        emit OrderSettled(tokenId, msg.sender);
        // 필요하면 burn 로직 추가
        // _burn(tokenId);
    }
}
