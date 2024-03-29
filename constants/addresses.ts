// DIVA Protocol V1 contract addresses by network.
// Used in example scripts only.
export const DIVA_ADDRESS: {
  [key: string]: string;
} = {
  ethMain: "0x2C9c47E7d254e493f02acfB410864b9a86c28e1D",
  polygon: "0x2C9c47E7d254e493f02acfB410864b9a86c28e1D",
  gnosis: "0x2C9c47E7d254e493f02acfB410864b9a86c28e1D",
  arbitrumMain: "0x2C9c47E7d254e493f02acfB410864b9a86c28e1D", // Arbitrum One
  goerli: "0x2C9c47E7d254e493f02acfB410864b9a86c28e1D",
  sepolia: "0x2C9c47E7d254e493f02acfB410864b9a86c28e1D",
  mumbai: "0x2C9c47E7d254e493f02acfB410864b9a86c28e1D",
  chiado: "0x2C9c47E7d254e493f02acfB410864b9a86c28e1D",
  arbitrumTestnet: "0x2C9c47E7d254e493f02acfB410864b9a86c28e1D",
};

// Ownership contract address on primary chain. Used in `stake.ts` example script only
export const OWNERSHIP_ADDRESS: {
  [key: string]: string;
} = {
  ethMain: "0xE39dEC81B2186A1A2e36bFC260F3Df444b36948A",
  sepolia: "0xE39dEC81B2186A1A2e36bFC260F3Df444b36948A",
};

// Used in `stake.ts` example script only
export const DIVA_TOKEN_ADDRESS: {
  [key: string]: string
} = {
  ethMain: "0x4B7fFCB2b92fB4890f22f62a52Fb7A180eaB818e",
  sepolia: "0x4B7fFCB2b92fB4890f22f62a52Fb7A180eaB818e",
};

// Used in example scripts only (e.g., `createContingentPool.ts`)
export const COLLATERAL_TOKENS: {
  [key: string]: {
    [key: string]: string;
  };
} = {
  goerli: {
    dUSD: "0xFA158C9B780A4213f3201Ae74Cca013712c8538d",
  },
  sepolia: {
    dUSD: "0xf0172F664195e3b91C3B8600476C58de48366a61",
    TDT: "0xf22200303F68cDF25CbB8bB95Be802046a020Cf5",
  },
  mumbai: {
    dUSD: "0xf5d5Ea0a5E86C543bEC01a9e4f513525365a86fD",
    WAGMI18: "0x91F13B8da062f9a042dbD37D2e61FBfAcEB267aC",
  },
  chiado: {
    dUSD: "0x524eF4F6225365470E6da2BEA59aF5dFdd9C8108",
  },
  arbitrumTestnet: {
    dUSD: "0x7F8c827150FeA992132Ad44Fe3EB58A9A5270490",
  },
  polygon: {
    PILOT: "0x39e896451487f03dC2489AcAef1788C787885d35",
  },
};

// Tellor contract INCLUDING the requirement to stake prior to reporting.
// Used for DIVA Protocol secondary version deployment.
// Source: https://docs.tellor.io/tellor/the-basics/contracts-reference
export const TELLOR_ADDRESS: {
  [key: string]: string;
} = {
  ethMain: "0xD9157453E2668B2fc45b7A803D3FEF3642430cC0",
  polygon: "0xD9157453E2668B2fc45b7A803D3FEF3642430cC0",
  gnosis: "0xD9157453E2668B2fc45b7A803D3FEF3642430cC0",
  arbitrumMain: "0xD9157453E2668B2fc45b7A803D3FEF3642430cC0", // Arbitrum One
  goerli: "0xD9157453E2668B2fc45b7A803D3FEF3642430cC0",
  sepolia: "0x199839a4907ABeC8240D119B606C98c405Bb0B33",
  mumbai: "0xD9157453E2668B2fc45b7A803D3FEF3642430cC0",
  chiado: "0xD9157453E2668B2fc45b7A803D3FEF3642430cC0",
  arbitrumTestnet: "0xb2CB696fE5244fB9004877e58dcB680cB86Ba444",
};

// Tellor playground contract EXCLUDING the requirement to stake prior to reporting.
// Used for tests only.
// Source: https://docs.tellor.io/tellor/the-basics/contracts-reference
export const TELLOR_PLAYGROUND_ADDRESS: {
  [key: string]: string;
} = {
  goerli: "0x3251838bd813fdf6a97D32781e011cce8D225d59",
  sepolia: "0x3251838bd813fdf6a97D32781e011cce8D225d59",
  mumbai: "0x3251838bd813fdf6a97D32781e011cce8D225d59",
  chiado: "0xe7147C5Ed14F545B4B17251992D1DB2bdfa26B6d",
  arbitrumTestnet: "0x3251838bd813fdf6a97D32781e011cce8D225d59",
};

// Used in example scripts only.
// Source: https://github.com/makerdao/multicall#multicall-contract-addresses
export const MULTICALL_ADDRESS: {
  [key: string]: string;
} = {
  ethMain: "0xeefba1e63905ef1d7acba5a8513c70307c1ce441",
  polygon: "0x11ce4B23bD875D7F5C6a31084f55fDe1e9A87507",
  gnosis: "0xb5b692a88bdfc81ca69dcb1d924f59f0413a602a",
  arbitrumMain: "", // Arbitrum One
  goerli: "0x77dCa2C955b15e9dE4dbBCf1246B4B85b651e50e",
  mumbai: "0x08411ADd0b5AA8ee47563b146743C13b3556c9Cc",
  chiado: "",
  sepolia: "",
  arbitrumTestnet: "",
};
