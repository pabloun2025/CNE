import { createHash } from "node:crypto";

export const sha256Hex = (valor: string): string => createHash("sha256").update(valor).digest("hex");
export const sha256Bytes = (valor: string | Buffer): Buffer => createHash("sha256").update(valor).digest();
