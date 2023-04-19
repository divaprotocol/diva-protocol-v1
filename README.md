## Installation

1. Clone this repo:
```console
git clone https://github.com/divaprotocol/diva-contracts.git
```

2. Install dependencies:
```console
cd diva-contracts
yarn install
```

## Add files
Running commands requires an `.env` and an `xdeploy.config.ts` file in the root directory which you can create as follows: 
* Copy `.env.example`, rename to `.env` and configure the corresponding parameters.
* Copy `xdeploy-config.example.ts` file and rename to `xdeploy-config.ts`. No modification of content needed for that file. 

## Compile contracts
```console
yarn c
```

## Run tests
```console
yarn t
```
Note that the `yarn t` includes the generation of the contract typings (`npx hardhat typechain`).

## Simple deployment
To deploy the contract on a single chain (e.g., goerli), run the following command:
```console
npx hardhat run scripts/deployMain.ts --network goerli
```
Make sure the selected network is configured in `hardhat.config.ts` before running the command.

## Cross-chain deployment with deterministic address
To deploy the contract on multiple EVM chains with the same deterministic address, an adjusted version of the [xdeployer](https://www.npmjs.com/package/xdeployer) plug-in is used. Note that only the secondary version of the DIVA system uses the `xdeployer` for deployment.

In order to use the `xdeployer` plug-in, the following configuration steps are required:
* Specify the chain names that you want to deploy on under `XDEPLOY_CHAINS` in `/constants.ts` (e.g., `XDEPLOY_CHAINS = ["goerli", "rinkeby"]`). Available chains are listed in the [xdeployer](https://www.npmjs.com/package/xdeployer) documentation.
* Make sure that the RPC endpoints for the corresponding chains are set in the `.env` file and follow the pattern `RPC_URL_*` where `*` is to be replaced with the network name in upper case. 
* Make sure that the `SALT`, which is specified in the `.env`, hasn't been used yet. If you have already used it, you will be notified in the deployment failure message.

The above parameters are aggregated in `generalXdeployConfig` inside `hardhat.config.ts` and used as the configuration parameters for the `xdeployer` plug-in.

For deployment, execute the the following command:
```console
yarn xdeploy:secondary:diva
```

## Generate ABI
To generate an ABI for the entire diamond (incl. functions from libraries), run the following command: 
```console
yarn abi
```
Note that the command includes a compilation step (`npx hardhat compile`) as the `generateDiamondABI` tasks uses the artifacts as the basis. 

## Documentation
Read the [DOCUMENTATION.md](https://github.com/divaprotocol/diva-contracts/blob/main/DOCUMENTATION.md) to find out how DIVA Protocol works.


## Get Help and Join the Community

If you need help or would like to discuss DIVA Protocol, join us on [discord](https://discord.gg/Pc7UBqxu2b) or send us a message on [twitter](https://twitter.com/divaprotocol_io).

## Useful Links
1. [Introduction to the Diamond Standard, EIP-2535 Diamonds](https://eip2535diamonds.substack.com/p/introduction-to-the-diamond-standard)
1. [EIP-2535 Diamonds](https://github.com/ethereum/EIPs/issues/2535)
1. [Understanding Diamonds on Ethereum](https://dev.to/mudgen/understanding-diamonds-on-ethereum-1fb)
1. [Solidity Storage Layout For Proxy Contracts and Diamonds](https://medium.com/1milliondevs/solidity-storage-layout-for-proxy-contracts-and-diamonds-c4f009b6903)
1. [New Storage Layout For Proxy Contracts and Diamonds](https://medium.com/1milliondevs/new-storage-layout-for-proxy-contracts-and-diamonds-98d01d0eadb)
1. [Upgradeable smart contracts using the Diamond Standard](https://hiddentao.com/archives/2020/05/28/upgradeable-smart-contracts-using-diamond-standard)
1. [buidler-deploy supports diamonds](https://github.com/wighawag/buidler-deploy/)

## Authors

DIVA Protocol was developed by a group of people that are strong advocates of financial freedom. DIVA Protocol is their contribution to an open and permissionless financial system.

## License

GNU Affero General Public License v3. See the license file.

