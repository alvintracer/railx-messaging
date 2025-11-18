// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract RemittanceOrder721 is ERC721, AccessControl, ReentrancyGuard {
    bytes32 public constant BANK_ROLE = keccak256("BANK_ROLE");

    enum Status {
        REQUESTED,
        APPROVED,
        SETTLED,
        CANCELED,
        EXPIRED
    }

    struct Order {
        bytes32 metaHash;
        bytes32 encKeyWrapHash;
        uint256 amountKRW;
        address srcBank;
        address dstBank;
        uint64  createdAt;
        uint64  expiry;
        Status  status;
    }

    mapping(uint256 => Order) public orders;
    uint256 public nextId;

    // EVENTS
    event OrderRequested(uint256 indexed tokenId, address indexed srcBank, address indexed dstBank);
    event OrderApproved(uint256 indexed tokenId, address indexed dstBank);
    event OrderSettled(uint256 indexed tokenId, address indexed bank);
    event OrderCanceled(uint256 indexed tokenId, address indexed bank);
    event OrderExpired(uint256 indexed tokenId);

    constructor() ERC721("RailX Remittance Order", "RXRO") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    // ----------- VIEW OVERRIDE ----------
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    // -------------------------------------
    //  REQUEST → (custody)
    // -------------------------------------
    function requestOrder(
        bytes32 metaHash,
        bytes32 encKeyWrapHash,
        uint256 amountKRW,
        address dstBank,
        uint64 expiry
    ) external onlyRole(BANK_ROLE) nonReentrant returns (uint256) 
    {
        uint256 tokenId = ++nextId;

        // custody 구조 → contract가 보관
        _safeMint(address(this), tokenId);

        orders[tokenId] = Order({
            metaHash:        metaHash,
            encKeyWrapHash:  encKeyWrapHash,
            amountKRW:       amountKRW,
            srcBank:         msg.sender,
            dstBank:         dstBank,
            createdAt:       uint64(block.timestamp),
            expiry:          expiry,
            status:          Status.REQUESTED
        });

        emit OrderRequested(tokenId, msg.sender, dstBank);
        return tokenId;
    }

    // -------------------------------------
    //  APPROVE → 상태만 변경 (custody 유지)
    // -------------------------------------
    function approveOrder(
        uint256 tokenId,
        bytes calldata proofAttestation
    ) external onlyRole(BANK_ROLE) nonReentrant 
    {
        Order storage o = orders[tokenId];

        require(o.status == Status.REQUESTED, "invalid state");
        require(msg.sender == o.dstBank, "not dstBank");
        require(block.timestamp <= o.expiry, "expired");

        // TODO: proofAttestation 검증 hook

        o.status = Status.APPROVED;
        emit OrderApproved(tokenId, msg.sender);
    }

    // -------------------------------------
    //  SETTLE → burn
    // -------------------------------------
    function settleOrder(uint256 tokenId) external onlyRole(BANK_ROLE) nonReentrant {
        Order storage o = orders[tokenId];

        require(o.status == Status.APPROVED, "not approved");
        require(msg.sender == o.dstBank, "not dstBank");

        o.status = Status.SETTLED;

        emit OrderSettled(tokenId, msg.sender);

        // burn at settle stage
        _burn(tokenId);
    }

    // -------------------------------------
    //  CANCEL (by srcBank)
    // -------------------------------------
    function cancelOrder(uint256 tokenId) external onlyRole(BANK_ROLE) nonReentrant {
        Order storage o = orders[tokenId];

        require(o.status == Status.REQUESTED, "cannot cancel");
        require(msg.sender == o.srcBank, "only srcBank");

        o.status = Status.CANCELED;
        emit OrderCanceled(tokenId, msg.sender);

        _burn(tokenId);
    }

    // -------------------------------------
    //  FORCE EXPIRE (anyone can call)
    // -------------------------------------
    function expireOrder(uint256 tokenId) external nonReentrant {
        Order storage o = orders[tokenId];

        require(o.status == Status.REQUESTED, "not request");
        require(block.timestamp > o.expiry, "not expired yet");

        o.status = Status.EXPIRED;
        emit OrderExpired(tokenId);

        _burn(tokenId);
    }
}