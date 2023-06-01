import * as dotenv from "dotenv";

import { HardhatUserConfig } from "hardhat/config";
import "@typechain/hardhat";
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-waffle";
import "@nomicfoundation/hardhat-network-helpers";
import "hardhat-gas-reporter";
import "hardhat-contract-sizer";
import "@nomiclabs/hardhat-etherscan";
import "solidity-coverage";
import "xdeployer";

import "./tasks/generateDiamondABI";
import "./tasks/accounts";
import { xdeployConfig } from "./xdeploy-config";
import { XDEPLOY_CHAINS } from "./constants";

dotenv.config();

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
// Good read on hardhat.config: https://medium.com/coinmonks/hardhat-configuration-c96415d4fcba

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const MNEMONIC = process.env.MNEMONIC || "";

// Need to update the XDEPLOY_CHAINS to the chains you want to deploy DIVA on when you deploy it using xdeployer
const generalXdeployConfig = {
  salt: process.env.SALT,
  signer: PRIVATE_KEY,
  gasLimit: 12 * 10 ** 6,
  networks: XDEPLOY_CHAINS,
  rpcUrls: XDEPLOY_CHAINS.map(
    (chainName) => process.env[`RPC_URL_${chainName.toUpperCase()}`]
  ),
};

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
// Make sure the network names match the ones in the xdeployer docs:
// https://www.npmjs.com/package/xdeployer
const config: HardhatUserConfig = {
  networks: {
    hardhat: {
      forking: {
        url: process.env.RPC_URL_MUMBAI || "",
        // blockNumber: 8219888, // Goerli
        // blockNumber: 4228882, // Chiado
        // blockNumber: 32419100, // Mumbai
        blockNumber: 23352716, // Arbitrum testnet
      },
      accounts: {
        mnemonic: MNEMONIC, // example with mnemonic; type: object
      },
      gas: "auto",
    },
    ethMain: {
      url: process.env.RPC_URL_MAINNET,
      chainId: 1,
      accounts: {
        mnemonic: MNEMONIC,
      },
    },
    goerli: {
      url: process.env.RPC_URL_GOERLI,
      chainId: 5,
      accounts: {
        mnemonic: MNEMONIC,
      },
      // gasPrice: 50000000000,
    },
    sepolia: {
      url: process.env.RPC_URL_SEPOLIA,
      chainId: 11155111,
      accounts: {
        mnemonic: MNEMONIC,
      },
    },
    gnosis: {
      url: process.env.RPC_URL_GNOSIS,
      chainId: 100,
      accounts: {
        mnemonic: MNEMONIC, // example with mnemonic; type: object
      },
      // accounts: [`0x${PRIVATE_KEY}`], // example with private key; type: array
    },
    chiado: {
      url: process.env.RPC_URL_CHIADO,
      chainId: 10200,
      accounts: {
        mnemonic: MNEMONIC,
      },
      gasPrice: 7000000000,
    },
    polygon: {
      url: process.env.RPC_URL_POLYGON,
      chainId: 137,
      accounts: {
        mnemonic: MNEMONIC,
      },
      gasPrice: 200000000000,
    },
    mumbai: {
      url: process.env.RPC_URL_MUMBAI,
      chainId: 80001,
      accounts: {
        mnemonic: MNEMONIC,
      },
      // Do not add `gas` or `gasPrice` params, otherwise xdeploy process will fail
    },
    arbitrumMain: {
      // arbitrumOne; there also exists arbitrumNova in xdeployer
      url: process.env.RPC_URL_ARBITRUM_MAINNET,
      chainId: 42161,
      accounts: {
        mnemonic: MNEMONIC,
      },
    },
    arbitrumTestnet: {
      url: process.env.RPC_URL_ARBITRUM_TESTNET,
      chainId: 421613,
      accounts: {
        mnemonic: MNEMONIC,
      },
    },
    optimismMain: {
      url: process.env.RPC_URL_OPTIMISM_MAINNET,
      chainId: 10,
      accounts: {
        mnemonic: MNEMONIC,
      },
    },
    optimismTestnet: {
      url: process.env.RPC_URL_OPTIMISM_TESTNET,
      chainId: 420,
      accounts: {
        mnemonic: MNEMONIC,
      },
    },
    apothem: {
      url: process.env.RPC_URL_APOTHEM,
      chainId: 51,
      accounts: {
        mnemonic: MNEMONIC,
      },
    },
    xdc: {
      url: process.env.RPC_URL_XDC,
      chainId: 50,
      accounts: {
        mnemonic: MNEMONIC,
      },
    },
  },
  xdeploy: { ...xdeployConfig, ...generalXdeployConfig },
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  etherscan: {
    apiKey: {
      mainnet: process.env.ETHERSCAN_API_KEY || "",
      goerli: process.env.ETHERSCAN_API_KEY || "",
      sepolia: process.env.ETHERSCAN_API_KEY || "",
      polygon: process.env.POLYGON_API_KEY || "",
      polygonMumbai: process.env.POLYGON_API_KEY || "",
      gnosis: process.env.GNOSISSCAN_API_KEY || "",
      arbitrumOne: process.env.ETHERSCAN_API_KEY || "",
      arbitrumGoerli: process.env.ETHERSCAN_API_KEY || "",
      arbitrumTestnet: process.env.ETHERSCAN_API_KEY || "",
      optimisticEthereum: process.env.ETHERSCAN_API_KEY || "",
      optimisticGoerli: process.env.ETHERSCAN_API_KEY || "",
    },
  },
  gasReporter: {
    currency: "USD",
    gasPrice: 100,
    enabled: true,
  },
  mocha: {
    timeout: 120000,
  },
};

export default config;
