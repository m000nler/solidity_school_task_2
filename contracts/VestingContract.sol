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
    uint256 private _cliffPeriod = 60 * 60 * 24 * 30 * 365 * 2;

    event Claim(address indexed claimerAddress);

    constructor(IERC20 _token, bytes32 merkleRoot) {
        token = _token;
        _merkleRoot = merkleRoot;
    }

    function claim(
        uint256 amount,
        uint256 timestamp,
        uint256 depositedAmount,
        bytes32[] calldata merkleProof
    ) public nonReentrant {
        require(
            (block.timestamp - timestamp) >= _cliffPeriod,
            "Cliff period didn't end"
        );
        require(depositedAmount >= amount, "Insufficient amount");
        require(
            _checkIfInMerkleTree(
                merkleProof,
                keccak256(
                    abi.encodePacked(msg.sender, depositedAmount, timestamp)
                )
            ),
            "Invalid proof"
        );

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
