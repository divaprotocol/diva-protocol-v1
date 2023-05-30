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
        url: process.env.RPC_URL_GOERLI || "",
        blockNumber: 8219888, // keep it aligned with the one in DIVAOwnershipSecondary.test.ts
      },
      accounts: {
        mnemonic: MNEMONIC, // example with mnemonic; type: object
      },
      gas: "auto",
    },
    ethMain: {
      url: process.env.RPC_URL_MAINNET,
      accounts: {
        mnemonic: MNEMONIC,
      },
    },
    goerli: {
      url: process.env.RPC_URL_GOERLI,
      accounts: {
        mnemonic: MNEMONIC,
      },
      // gasPrice: 50000000000,
    },
    sepolia: {
      url: process.env.RPC_URL_SEPOLIA,
      accounts: {
        mnemonic: MNEMONIC,
      },
    },
    gnosis: {
      url: process.env.RPC_URL_GNOSIS,
      accounts: {
        mnemonic: MNEMONIC, // example with mnemonic; type: object
      },
      // accounts: [`0x${PRIVATE_KEY}`], // example with private key; type: array
    },
    chiado: {
      url: process.env.RPC_URL_CHIADO,
      accounts: {
        mnemonic: MNEMONIC,
      },
      gasPrice: 7000000000,
    },
    polygon: {
      url: process.env.RPC_URL_POLYGON,
      accounts: {
        mnemonic: MNEMONIC,
      },
      gasPrice: 200000000000,
    },
    mumbai: {
      url: process.env.RPC_URL_MUMBAI,
      accounts: {
        mnemonic: MNEMONIC,
      },
      // Do not add `gas` or `gasPrice` params, otherwise xdeploy process will fail
    },
    arbitrumMain: {
      // there exists also arbitrumNova in xdeployer
      url: process.env.RPC_URL_ARBITRUM_MAINNET,
      accounts: {
        mnemonic: MNEMONIC,
      },
    },
    arbitrumTestnet: {
      url: process.env.RPC_URL_ARBITRUM_RINKEBY,
      accounts: {
        mnemonic: MNEMONIC,
      },
    },
    optimismMain: {
      url: process.env.RPC_URL_OPTIMISM_MAINNET,
      accounts: {
        mnemonic: MNEMONIC,
      },
    },
    optimismTestnet: {
      url: process.env.RPC_URL_OPTIMISM_KOVAN,
      accounts: {
        mnemonic: MNEMONIC,
      },
    },
    apothem: {
      url: process.env.RPC_URL_APOTHEM,
      accounts: {
        mnemonic: MNEMONIC,
      },
    },
    xdc: {
      url: process.env.RPC_URL_XDC,
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
      // For Rinkeby, Ropsten, Kovan, Goerli, Mainnet.
      mainnet: process.env.ETHERSCAN_API_KEY || "",
      goerli: process.env.ETHERSCAN_API_KEY || "",
      sepolia: process.env.ETHERSCAN_API_KEY || "",
      polygon: process.env.POLYGON_API_KEY || "",
      polygonMumbai: process.env.POLYGON_API_KEY || "",
      gnosis: process.env.GNOSISSCAN_API_KEY || "",
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
