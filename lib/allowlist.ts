// lib/allowlist.ts
// Utilities for parsing, normalizing and building Merkle data (Solidity compatible)

import { MerkleTree } from "merkletreejs";
import keccak256 from "keccak256";
import crypto from "node:crypto";
import { getAddress, isAddress } from "ethers";

// ----------------------------- Parsing --------------------------------------

/**
 * Split raw text or CSV content into potential addresses.
 * Accepts commas, newlines, whitespace. Ignores empty cells.
 */
export function splitToCandidates(raw: string): string[] {
  return raw
    .split(/[\s,;\n\r\t]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Validate/normalize addresses:
 * - accepts 0x-prefixed checksummed or lowercased addresses
 * - returns canonical EIP-55 checksummed addresses
 * - deduplicates using the checksum string (no lowercasing)
 * - sorts deterministically by numeric (BigInt) order to avoid any case transforms
 */
export function normalizeAndDedupe(
  candidates: string[]
): { canonical: string[]; invalid: string[]; duplicates: string[] } {
  const invalid: string[] = [];
  const duplicates: string[] = [];
  const canonical: string[] = [];
  const seen = new Set<string>();

  for (const raw of candidates) {
    // validate & normalize to checksum without lowercasing
    if (!isAddress(raw)) {
      invalid.push(raw);
      continue;
    }
    const checksum = getAddress(raw);
    if (seen.has(checksum)) {
      duplicates.push(checksum);
      continue;
    }
    seen.add(checksum);
    canonical.push(checksum);
  }

  // Deterministic sort by numeric address value (case-agnostic, no string lowercasing)
  canonical.sort((a, b) => {
    const A = BigInt(a);
    const B = BigInt(b);
    return A < B ? -1 : A > B ? 1 : 0;
  });

  return { canonical, invalid, duplicates };
}

// ----------------------------- Merkle ---------------------------------------

/**
 * Create a Solidity-compatible leaf for an address:
 * leaf = keccak256(abi.encodePacked(address))
 * i.e., keccak256 over the 20 raw address bytes (no string encoding).
 */
export function leafForAddress(addrChecksum: string): Buffer {
  // No need to lowercase the hex; Buffer.from(hex, "hex") is case-insensitive
  const bytes = Buffer.from(addrChecksum.slice(2), "hex"); // 20 bytes
  return keccak256(bytes); // Buffer (32 bytes)
}

/**
 * Build a Merkle tree for the given canonical address list.
 * - leaves are keccak(addressBytes)
 * - pairs are sorted at each level (matches common on-chain verification)
 */
export function buildTree(canonicalAddresses: string[]): MerkleTree {
  const leaves = canonicalAddresses.map(leafForAddress);
  return new MerkleTree(leaves, (d: Buffer) => keccak256(d), { sortPairs: true });
}

/** Return 0x-prefixed Merkle root string. */
export function getRootHex(tree: MerkleTree): string {
  return "0x" + tree.getRoot().toString("hex");
}

/** Get a hex proof array (0x-prefixed strings) for a given address. */
export function getProofHex(tree: MerkleTree, addrChecksum: string): string[] {
  const leaf = leafForAddress(addrChecksum);
  return tree.getHexProof(leaf);
}

/** Deterministic SHA-256 commit of the canonical list (for audit). */
export function sha256Commit(canonicalAddresses: string[]): string {
  const joined = canonicalAddresses.join("\n");
  return "0x" + crypto.createHash("sha256").update(joined).digest("hex");
}
