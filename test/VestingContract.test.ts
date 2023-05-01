import { loadFixture } from '@nomicfoundation/hardhat-network-helpers';
import { expect } from 'chai';
import { Wallet } from 'ethers';
import { keccak256, randomBytes } from 'ethers/lib/utils';
import { ethers, network } from 'hardhat';
import { MerkleTree } from 'merkletreejs';
// import { SolidityCoverage } from 'solidity-coverage';

import {
  // eslint-disable-next-line camelcase
  ERC20Default__factory,
  // eslint-disable-next-line camelcase
  VestingContract__factory,
} from '../typechain-types';

// const coverage = new SolidityCoverage({
//   provider: ethers.provider,
//   compileCommand: 'your_compile_command_here',
//   testCommand: 'your_test_command_here',
//   silent: true,
// });

describe('Vesting Contract tests', function () {
  async function deployment() {
    // await coverage.startCoverage();
    const signer = await ethers.provider.getSigner(0);
    const signer1 = await ethers.provider.getSigner(1);
    const token = await new ERC20Default__factory(signer).deploy();
    const timeUInt = await ethers.provider
      .getBlock('latest')
      .then((block) => block.timestamp);

    let randomAddresses = new Array(2000)
      .fill(0)
      .map(() =>
        ethers.utils.solidityPack(
          ['address', 'uint256', 'uint256'],
          [new Wallet(randomBytes(32)).address, 10, timeUInt],
        ),
      );

    randomAddresses = randomAddresses.concat(
      ethers.utils.solidityPack(
        ['address', 'uint256', 'uint256'],
        [await signer.getAddress(), 10, timeUInt],
      ),
    );

    const merkleTree = new MerkleTree(
      randomAddresses.concat(
        ethers.utils.solidityPack(
          ['address', 'uint256', 'uint256'],
          [await signer1.getAddress(), 5, timeUInt],
        ),
      ),
      keccak256,
      { hashLeaves: true, sortPairs: true },
    );

    const vestingContract = await new VestingContract__factory(signer).deploy(
      token.address,
      merkleTree.getHexRoot(),
    );

    return {
      vestingContract,
      token,
      merkleTree,
      randomAddresses,
      signer,
      signer1,
      timeUInt,
    };
  }

  describe('Deployment tests', async function () {
    it('Token deployment', async function () {
      const { token } = await loadFixture(deployment);

      await expect(token.address).is.not.empty;
    });

    it('Merkle tree deployment', async function () {
      const { merkleTree } = await loadFixture(deployment);

      await expect(merkleTree.getDepth()).to.be.at.least(1);
    });

    it('Contract deployment', async function () {
      const { vestingContract } = await loadFixture(deployment);

      await expect(vestingContract.address).is.not.empty;
    });
  });

  describe('Claim with merkle tree tests', async function () {
    it('Claim test', async function () {
      const { token, merkleTree, vestingContract, timeUInt, signer1 } =
        await loadFixture(deployment);
      await token.transfer(vestingContract.address, 10);
      const data = ethers.utils.solidityPack(
        ['address', 'uint256', 'uint256'],
        [await signer1.getAddress(), 5, timeUInt],
      );
      const proof = merkleTree.getHexProof(keccak256(data));
      await network.provider.send('evm_increaseTime', [
        60 * 60 * 24 * 30 * 365 * 2,
      ]);
      await vestingContract.connect(signer1).claim(2, timeUInt, 5, proof);
      const balance = await token.balanceOf(vestingContract.address);
      expect(balance.toString()).is.eq('8');
      // await coverage.stopCoverage();
    });

    it('New merkle root test', async function () {
      const { vestingContract, merkleTree } = await loadFixture(deployment);

      await vestingContract.setNewMerkleRoot(merkleTree.getHexRoot());
    });

    it('Cliff time test', async function () {
      const { token, merkleTree, vestingContract, timeUInt, signer1 } =
        await loadFixture(deployment);
      await token.transfer(vestingContract.address, 10);
      const data = ethers.utils.solidityPack(
        ['address', 'uint256', 'uint256'],
        [await signer1.getAddress(), 5, timeUInt],
      );
      const proof = merkleTree.getHexProof(keccak256(data));
      await expect(
        vestingContract.connect(signer1).claim(2, timeUInt, 5, proof),
      ).to.be.revertedWith("Cliff period didn't end");
    });

    it('Insufficient amount test', async function () {
      const { token, merkleTree, vestingContract, timeUInt, signer1 } =
        await loadFixture(deployment);
      await token.transfer(vestingContract.address, 10);
      const data = ethers.utils.solidityPack(
        ['address', 'uint256', 'uint256'],
        [await signer1.getAddress(), 5, timeUInt],
      );
      const proof = merkleTree.getHexProof(keccak256(data));
      await network.provider.send('evm_increaseTime', [
        60 * 60 * 24 * 30 * 365 * 2,
      ]);
      await expect(
        vestingContract.connect(signer1).claim(7, timeUInt, 5, proof),
      ).to.be.revertedWith('Insufficient amount');
    });

    it('Invalid proof test', async function () {
      const { token, merkleTree, vestingContract, timeUInt, signer1 } =
        await loadFixture(deployment);
      await token.transfer(vestingContract.address, 10);
      const data = ethers.utils.solidityPack(
        ['address', 'uint256', 'uint256'],
        [await signer1.getAddress(), 6, timeUInt],
      );
      const proof = merkleTree.getHexProof(keccak256(data));
      await network.provider.send('evm_increaseTime', [
        60 * 60 * 24 * 30 * 365 * 2,
      ]);
      await expect(
        vestingContract.connect(signer1).claim(2, timeUInt, 5, proof),
      ).to.be.revertedWith('Invalid proof');
    });
  });

  describe('Claim with admin signature tests', async function () {
    it('Claim test', async function () {
      const { token, vestingContract, timeUInt, signer } = await loadFixture(
        deployment,
      );
      await token.transfer(vestingContract.address, 10);
      const data = ethers.utils.solidityPack(
        ['address', 'uint256', 'uint256', 'uint256'],
        [await signer.getAddress(), 5, 2, timeUInt],
      );
      const hashedMessage = Buffer.from(keccak256(data).slice(2), 'hex');
      const signature = await signer.signMessage(hashedMessage);
      await network.provider.send('evm_increaseTime', [
        60 * 60 * 24 * 30 * 365 * 2,
      ]);
      await vestingContract
        .connect(signer)
        .claimByAdminSignature(2, 5, timeUInt, signature);
      const balance = await token.balanceOf(vestingContract.address);
      expect(balance.toString()).is.eq('8');
    });

    it('Cliff time test', async function () {
      const { token, vestingContract, timeUInt, signer } = await loadFixture(
        deployment,
      );
      await token.transfer(vestingContract.address, 10);
      const data = ethers.utils.solidityPack(
        ['address', 'uint256', 'uint256', 'uint256'],
        [await signer.getAddress(), 5, 2, timeUInt],
      );
      const hashedMessage = Buffer.from(keccak256(data).slice(2), 'hex');
      const signature = await signer.signMessage(hashedMessage);
      await expect(
        vestingContract
          .connect(signer)
          .claimByAdminSignature(2, 5, timeUInt, signature),
      ).to.be.revertedWith("Cliff period didn't end");
    });

    it('Insufficient amount test', async function () {
      const { token, vestingContract, timeUInt, signer } = await loadFixture(
        deployment,
      );
      await token.transfer(vestingContract.address, 10);
      const data = ethers.utils.solidityPack(
        ['address', 'uint256', 'uint256', 'uint256'],
        [await signer.getAddress(), 5, 7, timeUInt],
      );
      const hashedMessage = Buffer.from(keccak256(data).slice(2), 'hex');
      const signature = await signer.signMessage(hashedMessage);
      await network.provider.send('evm_increaseTime', [
        60 * 60 * 24 * 30 * 365 * 2,
      ]);
      await expect(
        vestingContract
          .connect(signer)
          .claimByAdminSignature(7, 5, timeUInt, signature),
      ).to.be.revertedWith('Insufficient amount');
    });

    it('Invalid signature test', async function () {
      const { token, vestingContract, timeUInt, signer } = await loadFixture(
        deployment,
      );
      await token.transfer(vestingContract.address, 10);
      const data = ethers.utils.solidityPack(
        ['address', 'uint256', 'uint256', 'uint256'],
        [await signer.getAddress(), 5, 2, timeUInt],
      );
      const hashedMessage = Buffer.from(keccak256(data).slice(2), 'hex');
      const signature = await signer.signMessage(hashedMessage);
      await network.provider.send('evm_increaseTime', [
        60 * 60 * 24 * 30 * 365 * 2,
      ]);
      await expect(
        vestingContract
          .connect(signer)
          .claimByAdminSignature(2, 4, timeUInt, signature),
      ).to.be.revertedWith('Invalid signature');
    });
  });
});
