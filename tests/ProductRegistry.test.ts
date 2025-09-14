import { describe, it, expect, beforeEach } from "vitest";
import { stringAsciiCV, uintCV, listCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_ORIGIN = 101;
const ERR_INVALID_BATCH_ID = 102;
const ERR_INVALID_CERTIFICATIONS = 103;
const ERR_INVALID_DESCRIPTION = 104;
const ERR_PRODUCT_ALREADY_EXISTS = 106;
const ERR_PRODUCT_NOT_FOUND = 107;
const ERR_SUPPLIER_NOT_CERTIFIED = 109;
const ERR_CERTIFICATIONS_NOT_VERIFIED = 110;
const ERR_INVALID_CATEGORY = 114;
const ERR_INVALID_QUANTITY = 115;
const ERR_INVALID_PRICE = 116;
const ERR_INVALID_LOCATION = 117;
const ERR_INVALID_CURRENCY = 118;
const ERR_MAX_PRODUCTS_EXCEEDED = 113;
const ERR_INVALID_UPDATE_PARAM = 112;
const ERR_AUTHORITY_NOT_SET = 119;

interface Product {
  supplier: string;
  origin: string;
  batchId: string;
  certifications: string[];
  description: string;
  registeredAt: number;
  category: string;
  quantity: number;
  price: number;
  location: string;
  currency: string;
  status: boolean;
}

interface ProductUpdate {
  updateOrigin: string;
  updateBatchId: string;
  updateDescription: string;
  updateTimestamp: number;
  updater: string;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class ProductRegistryMock {
  state: {
    nextProductId: number;
    maxProducts: number;
    registrationFee: number;
    authorityContract: string | null;
    products: Map<number, Product>;
    productUpdates: Map<number, ProductUpdate>;
    productsByBatch: Map<string, number>;
  } = {
    nextProductId: 0,
    maxProducts: 10000,
    registrationFee: 500,
    authorityContract: null,
    products: new Map(),
    productUpdates: new Map(),
    productsByBatch: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  suppliers: Set<string> = new Set(["ST1TEST"]);
  certifications: Set<string> = new Set(["organic", "fair-trade"]);
  stxTransfers: Array<{ amount: number; from: string; to: string | null }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextProductId: 0,
      maxProducts: 10000,
      registrationFee: 500,
      authorityContract: null,
      products: new Map(),
      productUpdates: new Map(),
      productsByBatch: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.suppliers = new Set(["ST1TEST"]);
    this.certifications = new Set(["organic", "fair-trade"]);
    this.stxTransfers = [];
  }

  isCertifiedSupplier(supplier: string): boolean {
    return this.suppliers.has(supplier);
  }

  verifyCertifications(certs: string[]): boolean {
    return certs.every(cert => this.certifications.has(cert));
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (contractPrincipal === "SP000000000000000000002Q6VF78") {
      return { ok: false, value: false };
    }
    if (this.state.authorityContract !== null) {
      return { ok: false, value: false };
    }
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setRegistrationFee(newFee: number): Result<boolean> {
    if (!this.state.authorityContract) return { ok: false, value: false };
    this.state.registrationFee = newFee;
    return { ok: true, value: true };
  }

  registerProduct(
    origin: string,
    batchId: string,
    certifications: string[],
    description: string,
    category: string,
    quantity: number,
    price: number,
    location: string,
    currency: string
  ): Result<number> {
    if (this.state.nextProductId >= this.state.maxProducts) return { ok: false, value: ERR_MAX_PRODUCTS_EXCEEDED };
    if (!origin || origin.length > 100) return { ok: false, value: ERR_INVALID_ORIGIN };
    if (!batchId || batchId.length > 50) return { ok: false, value: ERR_INVALID_BATCH_ID };
    if (certifications.length > 10) return { ok: false, value: ERR_INVALID_CERTIFICATIONS };
    if (description.length > 256) return { ok: false, value: ERR_INVALID_DESCRIPTION };
    if (!category || category.length > 50) return { ok: false, value: ERR_INVALID_CATEGORY };
    if (quantity <= 0) return { ok: false, value: ERR_INVALID_QUANTITY };
    if (price < 0) return { ok: false, value: ERR_INVALID_PRICE };
    if (!location || location.length > 100) return { ok: false, value: ERR_INVALID_LOCATION };
    if (!["STX", "USD", "BTC"].includes(currency)) return { ok: false, value: ERR_INVALID_CURRENCY };
    if (!this.isCertifiedSupplier(this.caller)) return { ok: false, value: ERR_SUPPLIER_NOT_CERTIFIED };
    if (!this.verifyCertifications(certifications)) return { ok: false, value: ERR_CERTIFICATIONS_NOT_VERIFIED };
    if (this.state.productsByBatch.has(batchId)) return { ok: false, value: ERR_PRODUCT_ALREADY_EXISTS };
    if (!this.state.authorityContract) return { ok: false, value: ERR_AUTHORITY_NOT_SET };

    this.stxTransfers.push({ amount: this.state.registrationFee, from: this.caller, to: this.state.authorityContract });

    const id = this.state.nextProductId;
    const product: Product = {
      supplier: this.caller,
      origin,
      batchId,
      certifications,
      description,
      registeredAt: this.blockHeight,
      category,
      quantity,
      price,
      location,
      currency,
      status: true,
    };
    this.state.products.set(id, product);
    this.state.productsByBatch.set(batchId, id);
    this.state.nextProductId++;
    return { ok: true, value: id };
  }

  getProduct(id: number): Product | null {
    return this.state.products.get(id) || null;
  }

  updateProduct(id: number, updateOrigin: string, updateBatchId: string, updateDescription: string): Result<boolean> {
    const product = this.state.products.get(id);
    if (!product) return { ok: false, value: false };
    if (product.supplier !== this.caller) return { ok: false, value: false };
    if (!updateOrigin || updateOrigin.length > 100) return { ok: false, value: false };
    if (!updateBatchId || updateBatchId.length > 50) return { ok: false, value: false };
    if (updateDescription.length > 256) return { ok: false, value: false };
    if (this.state.productsByBatch.has(updateBatchId) && this.state.productsByBatch.get(updateBatchId) !== id) {
      return { ok: false, value: false };
    }

    const updated: Product = {
      ...product,
      origin: updateOrigin,
      batchId: updateBatchId,
      description: updateDescription,
      registeredAt: this.blockHeight,
    };
    this.state.products.set(id, updated);
    this.state.productsByBatch.delete(product.batchId);
    this.state.productsByBatch.set(updateBatchId, id);
    this.state.productUpdates.set(id, {
      updateOrigin,
      updateBatchId,
      updateDescription,
      updateTimestamp: this.blockHeight,
      updater: this.caller,
    });
    return { ok: true, value: true };
  }

  getProductCount(): Result<number> {
    return { ok: true, value: this.state.nextProductId };
  }

  checkProductExistence(batchId: string): Result<boolean> {
    return { ok: true, value: this.state.productsByBatch.has(batchId) };
  }
}

describe("ProductRegistry", () => {
  let contract: ProductRegistryMock;

  beforeEach(() => {
    contract = new ProductRegistryMock();
    contract.reset();
  });

  it("registers a product successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.registerProduct(
      "Ethiopia",
      "BATCH001",
      ["organic"],
      "Coffee beans",
      "Food",
      1000,
      500,
      "FarmX",
      "STX"
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);

    const product = contract.getProduct(0);
    expect(product?.origin).toBe("Ethiopia");
    expect(product?.batchId).toBe("BATCH001");
    expect(product?.certifications).toEqual(["organic"]);
    expect(product?.description).toBe("Coffee beans");
    expect(product?.category).toBe("Food");
    expect(product?.quantity).toBe(1000);
    expect(product?.price).toBe(500);
    expect(product?.location).toBe("FarmX");
    expect(product?.currency).toBe("STX");
    expect(contract.stxTransfers).toEqual([{ amount: 500, from: "ST1TEST", to: "ST2TEST" }]);
  });

  it("rejects duplicate batch ids", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.registerProduct(
      "Ethiopia",
      "BATCH001",
      ["organic"],
      "Coffee beans",
      "Food",
      1000,
      500,
      "FarmX",
      "STX"
    );
    const result = contract.registerProduct(
      "Brazil",
      "BATCH001",
      ["fair-trade"],
      "Tea leaves",
      "Beverage",
      2000,
      300,
      "FarmY",
      "USD"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_PRODUCT_ALREADY_EXISTS);
  });

  it("rejects uncertified supplier", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.caller = "ST2FAKE";
    contract.suppliers = new Set();
    const result = contract.registerProduct(
      "Ethiopia",
      "BATCH001",
      ["organic"],
      "Coffee beans",
      "Food",
      1000,
      500,
      "FarmX",
      "STX"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_SUPPLIER_NOT_CERTIFIED);
  });

  it("rejects invalid certifications", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.registerProduct(
      "Ethiopia",
      "BATCH001",
      ["invalid"],
      "Coffee beans",
      "Food",
      1000,
      500,
      "FarmX",
      "STX"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_CERTIFICATIONS_NOT_VERIFIED);
  });

  it("rejects registration without authority contract", () => {
    const result = contract.registerProduct(
      "Ethiopia",
      "BATCH001",
      ["organic"],
      "Coffee beans",
      "Food",
      1000,
      500,
      "FarmX",
      "STX"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_AUTHORITY_NOT_SET);
  });

  it("rejects invalid origin", () => {
    contract.setAuthorityContract("ST2TEST");
    const longOrigin = "a".repeat(101);
    const result = contract.registerProduct(
      longOrigin,
      "BATCH001",
      ["organic"],
      "Coffee beans",
      "Food",
      1000,
      500,
      "FarmX",
      "STX"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_ORIGIN);
  });

  it("rejects invalid quantity", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.registerProduct(
      "Ethiopia",
      "BATCH001",
      ["organic"],
      "Coffee beans",
      "Food",
      0,
      500,
      "FarmX",
      "STX"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_QUANTITY);
  });

  it("rejects invalid currency", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.registerProduct(
      "Ethiopia",
      "BATCH001",
      ["organic"],
      "Coffee beans",
      "Food",
      1000,
      500,
      "FarmX",
      "EUR"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_CURRENCY);
  });

  it("updates a product successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.registerProduct(
      "Ethiopia",
      "BATCH001",
      ["organic"],
      "Coffee beans",
      "Food",
      1000,
      500,
      "FarmX",
      "STX"
    );
    const result = contract.updateProduct(0, "Brazil", "BATCH002", "Tea leaves");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const product = contract.getProduct(0);
    expect(product?.origin).toBe("Brazil");
    expect(product?.batchId).toBe("BATCH002");
    expect(product?.description).toBe("Tea leaves");
    const update = contract.state.productUpdates.get(0);
    expect(update?.updateOrigin).toBe("Brazil");
    expect(update?.updateBatchId).toBe("BATCH002");
    expect(update?.updateDescription).toBe("Tea leaves");
    expect(update?.updater).toBe("ST1TEST");
  });

  it("rejects update for non-existent product", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.updateProduct(99, "Brazil", "BATCH002", "Tea leaves");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects update by non-supplier", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.registerProduct(
      "Ethiopia",
      "BATCH001",
      ["organic"],
      "Coffee beans",
      "Food",
      1000,
      500,
      "FarmX",
      "STX"
    );
    contract.caller = "ST3FAKE";
    const result = contract.updateProduct(0, "Brazil", "BATCH002", "Tea leaves");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("sets registration fee successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.setRegistrationFee(1000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.registrationFee).toBe(1000);
    contract.registerProduct(
      "Ethiopia",
      "BATCH001",
      ["organic"],
      "Coffee beans",
      "Food",
      1000,
      500,
      "FarmX",
      "STX"
    );
    expect(contract.stxTransfers).toEqual([{ amount: 1000, from: "ST1TEST", to: "ST2TEST" }]);
  });

  it("rejects registration fee change without authority contract", () => {
    const result = contract.setRegistrationFee(1000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("returns correct product count", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.registerProduct(
      "Ethiopia",
      "BATCH001",
      ["organic"],
      "Coffee beans",
      "Food",
      1000,
      500,
      "FarmX",
      "STX"
    );
    contract.registerProduct(
      "Brazil",
      "BATCH002",
      ["fair-trade"],
      "Tea leaves",
      "Beverage",
      2000,
      300,
      "FarmY",
      "USD"
    );
    const result = contract.getProductCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it("checks product existence correctly", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.registerProduct(
      "Ethiopia",
      "BATCH001",
      ["organic"],
      "Coffee beans",
      "Food",
      1000,
      500,
      "FarmX",
      "STX"
    );
    const result = contract.checkProductExistence("BATCH001");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const result2 = contract.checkProductExistence("NONEXISTENT");
    expect(result2.ok).toBe(true);
    expect(result2.value).toBe(false);
  });

  it("parses product parameters with Clarity types", () => {
    const origin = stringAsciiCV("Ethiopia");
    const batchId = stringAsciiCV("BATCH001");
    const certifications = listCV([stringAsciiCV("organic")]);
    const quantity = uintCV(1000);
    expect(origin.value).toBe("Ethiopia");
    expect(batchId.value).toBe("BATCH001");
    expect(certifications.value[0].value).toBe("organic");
    expect(quantity.value).toEqual(BigInt(1000));
  });

  it("rejects product registration with empty origin", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.registerProduct(
      "",
      "BATCH001",
      ["organic"],
      "Coffee beans",
      "Food",
      1000,
      500,
      "FarmX",
      "STX"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_ORIGIN);
  });

  it("rejects product registration with max products exceeded", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.state.maxProducts = 1;
    contract.registerProduct(
      "Ethiopia",
      "BATCH001",
      ["organic"],
      "Coffee beans",
      "Food",
      1000,
      500,
      "FarmX",
      "STX"
    );
    const result = contract.registerProduct(
      "Brazil",
      "BATCH002",
      ["fair-trade"],
      "Tea leaves",
      "Beverage",
      2000,
      300,
      "FarmY",
      "USD"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_PRODUCTS_EXCEEDED);
  });

  it("sets authority contract successfully", () => {
    const result = contract.setAuthorityContract("ST2TEST");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.authorityContract).toBe("ST2TEST");
  });

  it("rejects invalid authority contract", () => {
    const result = contract.setAuthorityContract("SP000000000000000000002Q6VF78");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });
});