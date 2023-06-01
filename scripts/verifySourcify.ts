import SourcifyJS from 'sourcify-js';
import {promises} from 'fs';

const main = async () => {
    const sourcify = new SourcifyJS()
    const buffer = await promises.readFile(`artifacts/build-info/2ca9dcdc14848a34e03526a42652fdbc.json`)
    const result = await sourcify.verify(
        100, // chain Id
        [
            {
                name: 'Diamond',
                address: '0xeC70e33c55E9c3bA724295e56Baa885E4EA6F90F'
            }
        ], // contracts to verify
        buffer // file containing sources and metadata
    )
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
