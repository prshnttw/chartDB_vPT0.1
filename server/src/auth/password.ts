import { hash, verify, Algorithm } from '@node-rs/argon2';

// Argon2id with OWASP-recommended parameters (19 MiB, t=2, p=1).
const options = {
    algorithm: Algorithm.Argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
} as const;

export const hashPassword = (password: string) => hash(password, options);

export const verifyPassword = async (
    passwordHash: string,
    password: string
): Promise<boolean> => {
    try {
        return await verify(passwordHash, password);
    } catch {
        return false;
    }
};

// Verified against when the email is unknown, so response time does not reveal
// whether an account exists.
let dummyHash: Promise<string> | undefined;
export const verifyDummy = async (password: string) => {
    dummyHash ??= hashPassword('dummy-password-for-timing-1');
    await verifyPassword(await dummyHash, password);
};
