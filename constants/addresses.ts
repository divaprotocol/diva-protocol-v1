// DIVA contract addresses by network (as of 26 Feb 2023)
export const DIVA_ADDRESS: {
  [key: string]: string
} = {
  polygon: "0x60f5A0c12457761558f5d9933f5924fE8907eBcf",
  mumbai: "0x05029c04AFB6cf53Ef0af7af7e970E53A7143bD3",
  goerli: "0x131e157322b3DDaE6eF28a124f566bC9c177De69",
  sepolia: "0xF554e0FE7F75BaA00d76c4347fc098C9F88D2D25",
  apothem: "0x93640bd8fEa53919A102ad2EEA4c503E640eDDAd",
};

export const OWNERSHIP_ADDRESS: {
  [key: string]: string
} = {
  goerli: "0x108bCa75C4d3F1828E6767B38eacC5AF16b823CB",
}

export const DIVA_TOKEN_ADDRESS: {[key: string]: string} = {
  goerli: "0xEA2d2c2f6918e05FF28038231367773bdb02Eb42",
};

export const COLLATERAL_TOKENS: {
  [key: string]: {
    [key: string]: string;
  };
} = {
  goerli: {
    dUSD: "0xFA158C9B780A4213f3201Ae74Cca013712c8538d",
  },
  mumbai: {
    WAGMI18: "0x91F13B8da062f9a042dbD37D2e61FBfAcEB267aC",
  },
};

// Tellor contract INCLUDING the requirement to stake prior to reporting
// Source: https://docs.tellor.io/tellor/the-basics/contracts-reference
export const TELLOR_ADDRESS: {
  [key: string]: string
} = {
  ethMain: "0xB3B662644F8d3138df63D2F43068ea621e2981f9",
  polygon: "0xD9157453E2668B2fc45b7A803D3FEF3642430cC0",
  gnosis: "0xD9157453E2668B2fc45b7A803D3FEF3642430cC0",
  goerli: "0xD9157453E2668B2fc45b7A803D3FEF3642430cC0",
  mumbai: "0xD9157453E2668B2fc45b7A803D3FEF3642430cC0",
  chiado: "0xD9157453E2668B2fc45b7A803D3FEF3642430cC0",
  sepolia: "0x199839a4907ABeC8240D119B606C98c405Bb0B33",
};

// Tellor playground contract EXCLUDING the requirement to stake prior to reporting
// Source: https://docs.tellor.io/tellor/the-basics/contracts-reference
export const TELLOR_PLAYGROUND_ADDRESS: {
  [key: string]: string
} = {
  goerli: "0x3251838bd813fdf6a97D32781e011cce8D225d59",
  sepolia: "0x3251838bd813fdf6a97D32781e011cce8D225d59",
  mumbai: "0x3251838bd813fdf6a97D32781e011cce8D225d59",
  arbitrumTestnet: "0x3251838bd813fdf6a97D32781e011cce8D225d59",
  optimismTestnet: "0x3251838bd813fdf6a97D32781e011cce8D225d59",
};

export const MULTICALL_ADDRESS: {
  [key: string]: string
} = {
  goerli: "0x77dCa2C955b15e9dE4dbBCf1246B4B85b651e50e",
};
