// Import the Mod class
import { Mod } from './mod.js';

// Load MOD file from a url
export const loadMod = async (url) => {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const mod = new Mod(arrayBuffer);
    return mod;
};
