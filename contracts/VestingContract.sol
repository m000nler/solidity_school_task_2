// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract VestingContract is Ownable, ReentrancyGuard {
    using ECDSA for bytes32;
    using SafeERC20 for ERC20;

    IERC20 public token;
    bytes32 private _merkleRoot;
    mapping(address => bool) private _claimed;
    uint256 private _cliffPeriod = 60 * 60 * 24 * 30 * 365 * 2;
    uint256 private _cliffStarted;

    event Claim(address indexed claimerAddress);

    constructor(
        IERC20 _token,
        bytes32 merkleRoot,
        uint256 cliffStarted
    ) {
        token = _token;
        _merkleRoot = merkleRoot;
        _cliffStarted = cliffStarted;
    }

    function claim(uint256 amount, bytes32[] calldata merkleProof)
        public
        nonReentrant
    {
        require(!_claimed[msg.sender], "User has already claimed");
        require(
            block.timestamp - _cliffStarted >= _cliffPeriod,
            "Cliff period didn't end"
        );
        require(
            _checkIfInMerkleTree(
                merkleProof,
                keccak256(abi.encodePacked(msg.sender, amount))
            ),
            "Invalid proof"
        );

        _claimed[msg.sender] = true;

        SafeERC20.safeTransfer(token, msg.sender, amount);

        emit Claim(msg.sender);
    }

    function claimByAdminSignature(uint256 amount, bytes memory signature)
        public
    {
        bytes32 message = keccak256(abi.encodePacked(msg.sender, amount));
        address signer = message.toEthSignedMessageHash().recover(signature);
        require(signer == owner(), "Invalid signature");
        require(
            (block.timestamp - _cliffStarted) >= _cliffPeriod,
            "Cliff period didn't end"
        );

        _claimed[msg.sender] = true;

        SafeERC20.safeTransfer(token, msg.sender, amount);

        emit Claim(msg.sender);
    }

    function setNewMerkleRoot(bytes32 merkleRoot) public onlyOwner {
        _merkleRoot = merkleRoot;
    }

    function _checkIfInMerkleTree(bytes32[] calldata merkleProof, bytes32 node)
        private
        view
        returns (bool)
    {
        return MerkleProof.verify(merkleProof, _merkleRoot, node);
    }
}
