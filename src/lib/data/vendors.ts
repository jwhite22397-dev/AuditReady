import { AppError } from "@/lib/domain/errors";
import { entitlementsFor, withinLimit } from "@/lib/domain/entitlements";
import { scoreInherent } from "@/lib/domain/risk";
import { createId, todayUTC } from "@/lib/domain/tokens";
import type {
  Database,
  RiskLevel,
  Session,
  Vendor,
  VendorContact,
} from "@/lib/domain/types";
import { emptyCriticalityFactors } from "@/lib/domain/types";
import {
  contactSchema,
  criticalitySchema,
  inherentAnswersFrom,
  inherentSchema,
  vendorSchema,
  type VendorInput,
} from "@/lib/domain/validation";
import { rowsToObjects, parseCsv } from "@/lib/domain/csv";
import { assertCan, audit, parseInput, type EngineCtx } from "./context";

export function listVendors(db: Database, session: Session, filters?: VendorFilters): Vendor[] {
  const scope = assertCan(db, session, "vendors.read");
  const today = todayUTC();
  let rows = db.vendors.filter((vendor) => vendor.organizationId === scope.org.id && !vendor.deletedAt);
  const search = filters?.search?.trim().toLowerCase();
  if (search) rows = rows.filter((vendor) => vendor.name.toLowerCase().includes(search));
  if (filters?.risk && filters.risk !== "all") rows = rows.filter((vendor) => vendor.overallRisk === filters.risk);
  if (filters?.criticality && filters.criticality !== "all") {
    rows = rows.filter((vendor) => vendor.criticality === filters.criticality);
  }
  if (filters?.status && filters.status !== "all") rows = rows.filter((vendor) => vendor.assessmentStatus === filters.status);
  if (filters?.owner && filters.owner !== "all") {
    const owner = filters.owner.toLowerCase();
    rows = rows.filter(
      (vendor) => vendor.businessOwner.toLowerCase().includes(owner) || vendor.securityOwner.toLowerCase().includes(owner),
    );
  }
  if (filters?.due === "overdue" || filters?.due === "due_30") {
    rows = rows.filter((vendor) => {
      const due = vendorDueDate(db, vendor);
      if (!due) return false;
      if (filters.due === "overdue") return due < today;
      const horizon = new Date(`${today}T00:00:00Z`);
      horizon.setUTCDate(horizon.getUTCDate() + 30);
      return due <= horizon.toISOString().slice(0, 10);
    });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export interface VendorFilters {
  search?: string;
  risk?: RiskLevel | "all";
  criticality?: Vendor["criticality"] | "all";
  status?: Vendor["assessmentStatus"] | "all";
  owner?: string | "all";
  due?: "all" | "overdue" | "due_30";
}

export function getVendor(db: Database, session: Session, vendorId: string): Vendor {
  const scope = assertCan(db, session, "vendors.read");
  const vendor = db.vendors.find((item) => item.id === vendorId && item.organizationId === scope.org.id && !item.deletedAt);
  if (!vendor) throw new AppError("not_found", "Vendor not found.");
  return vendor;
}

export function createVendor(db: Database, session: Session, input: unknown, now: string, mode: EngineCtx["mode"]): Vendor {
  const scope = assertCan(db, session, "vendors.write");
  const limits = entitlementsFor(scope.org.plan, mode);
  const used = db.vendors.filter((vendor) => vendor.organizationId === scope.org.id && !vendor.deletedAt).length;
  if (!withinLimit(used, limits.vendors)) throw new AppError("conflict", "The plan vendor limit has been reached.");
  const parsed = parseInput(vendorSchema, input);
  const vendor = buildVendor(scope.org.id, parsed, now);
  db.vendors.push(vendor);
  audit(db, scope, {
    action: "vendor.created",
    entityType: "vendor",
    entityId: vendor.id,
    summary: `Vendor ${vendor.name} created.`,
    after: { name: vendor.name, criticality: vendor.criticality },
    now,
  });
  return vendor;
}

export function updateVendor(db: Database, session: Session, vendorId: string, input: unknown, now: string): Vendor {
  const scope = assertCan(db, session, "vendors.write");
  const vendor = getVendor(db, session, vendorId);
  const parsed = parseInput(vendorSchema, input);
  const before = { name: vendor.name, criticality: vendor.criticality };
  Object.assign(vendor, parsed, { updatedAt: now });
  audit(db, scope, {
    action: "vendor.updated",
    entityType: "vendor",
    entityId: vendor.id,
    summary: `Vendor ${vendor.name} updated.`,
    before,
    after: { name: vendor.name, criticality: vendor.criticality },
    now,
  });
  return vendor;
}

export function importVendors(db: Database, session: Session, csv: string, now: string, mode: EngineCtx["mode"]) {
  const scope = assertCan(db, session, "vendors.write");
  const { headers, records } = rowsToObjects(parseCsv(csv));
  const required = ["name", "service", "category"];
  if (!required.every((header) => headers.includes(header))) {
    throw new AppError("validation", "The CSV must include name, service, and category columns. Download the template and try again.");
  }
  const errors: { row: number; message: string }[] = [];
  const valid: VendorInput[] = [];
  records.forEach((record, index) => {
    const parsed = vendorSchema.safeParse({
      name: record.name ?? "",
      website: record.website ?? "",
      service: record.service ?? "",
      category: record.category ?? "",
      businessOwner: record.business_owner ?? "",
      securityOwner: record.security_owner ?? "",
      criticality: record.criticality || "moderate",
      dataAccess: record.data_access || "internal",
      systemAccess: record.system_access || "none",
      reviewFrequency: record.review_frequency || "annual",
      notes: record.notes ?? "",
    });
    if (!parsed.success) errors.push({ row: index + 2, message: parsed.error.issues[0]?.message ?? "Invalid row." });
    else valid.push(parsed.data);
  });
  const limits = entitlementsFor(scope.org.plan, mode);
  const used = db.vendors.filter((vendor) => vendor.organizationId === scope.org.id && !vendor.deletedAt).length;
  const created: Vendor[] = [];
  for (const input of valid) {
    if (!withinLimit(used + created.length, limits.vendors)) {
      errors.push({ row: 0, message: "Plan vendor limit reached. Remaining rows were not imported." });
      break;
    }
    const vendor = buildVendor(scope.org.id, input, now);
    db.vendors.push(vendor);
    created.push(vendor);
  }
  if (created.length > 0) {
    audit(db, scope, {
      action: "vendor.imported",
      entityType: "vendor",
      entityId: scope.org.id,
      summary: `Imported ${created.length} vendor${created.length === 1 ? "" : "s"}.`,
      after: { created: created.length, errors: errors.length },
      now,
    });
  }
  return { created, errors };
}

export function vendorImportTemplate(): string {
  return [
    "name,website,service,category,business_owner,security_owner,criticality,data_access,system_access,review_frequency,notes",
    "Example Cloud,https://example.com,Cloud hosting,cloud_infrastructure,Avery Chen,Jordan Hale,high,customer_pii,production,annual,Sample row — delete before import",
  ].join("\n");
}

export function saveCriticality(db: Database, session: Session, vendorId: string, input: unknown, now: string): Vendor {
  const scope = assertCan(db, session, "vendors.write");
  const vendor = getVendor(db, session, vendorId);
  const parsed = parseInput(criticalitySchema, input);
  if ((parsed.criticality === "high" || parsed.criticality === "critical") && parsed.criticalityJustification.trim().length < 8) {
    throw new AppError("validation", "Add a short justification for a high or critical rating.");
  }
  const before = vendor.criticality;
  vendor.criticality = parsed.criticality;
  vendor.criticalityJustification = parsed.criticalityJustification;
  vendor.criticalityFactors = {
    sensitiveData: parsed.sensitiveData,
    productionAccess: parsed.productionAccess,
    businessDependency: parsed.businessDependency,
    privilegedAccess: parsed.privilegedAccess,
    customerData: parsed.customerData,
    financialImpact: parsed.financialImpact,
  };
  vendor.updatedAt = now;
  audit(db, scope, {
    action: "vendor.criticality_changed",
    entityType: "vendor",
    entityId: vendor.id,
    summary: `Criticality for ${vendor.name} set to ${parsed.criticality}.`,
    before: { criticality: before },
    after: { criticality: parsed.criticality },
    now,
  });
  return vendor;
}

export function saveInherentRisk(db: Database, session: Session, vendorId: string, input: unknown, now: string): Vendor {
  const scope = assertCan(db, session, "vendors.write");
  const vendor = getVendor(db, session, vendorId);
  const parsed = parseInput(inherentSchema, input);
  const answers = inherentAnswersFrom(parsed);
  const scored = scoreInherent(answers);
  if (parsed.override && parsed.override !== scored.level && parsed.overrideJustification.trim().length < 8) {
    throw new AppError("validation", "Explain why you are overriding the recommended tier.");
  }
  const before = vendor.riskTier;
  vendor.inherent = {
    answers,
    score: scored.score,
    recommended: scored.level,
    override: parsed.override,
    overrideJustification: parsed.override ? parsed.overrideJustification : "",
    assessedAt: now,
    assessedBy: scope.user.id,
  };
  vendor.riskTier = parsed.override ?? scored.level;
  if (!vendor.overallRisk) vendor.overallRisk = vendor.riskTier;
  vendor.updatedAt = now;
  audit(db, scope, {
    action: "vendor.inherent_risk_changed",
    entityType: "vendor",
    entityId: vendor.id,
    summary: `Inherent risk for ${vendor.name} set to ${vendor.riskTier}.`,
    before: { riskTier: before },
    after: { riskTier: vendor.riskTier, score: scored.score, recommended: scored.level },
    now,
  });
  return vendor;
}

export function addContact(db: Database, session: Session, vendorId: string, input: unknown, now: string): VendorContact {
  const scope = assertCan(db, session, "vendors.write");
  const vendor = getVendor(db, session, vendorId);
  const parsed = parseInput(contactSchema, input);
  const contact: VendorContact = {
    id: createId(),
    organizationId: scope.org.id,
    vendorId: vendor.id,
    name: parsed.name,
    title: parsed.title,
    email: parsed.email,
    contactRole: parsed.contactRole,
    createdAt: now,
    deletedAt: null,
  };
  db.contacts.push(contact);
  audit(db, scope, {
    action: "vendor.contact_added",
    entityType: "vendor_contact",
    entityId: contact.id,
    summary: `Contact ${contact.name} added to ${vendor.name}.`,
    now,
  });
  return contact;
}

export function updateContact(db: Database, session: Session, contactId: string, input: unknown): VendorContact {
  const scope = assertCan(db, session, "vendors.write");
  const contact = db.contacts.find((item) => item.id === contactId && item.organizationId === scope.org.id && !item.deletedAt);
  if (!contact) throw new AppError("not_found", "Contact not found.");
  const parsed = parseInput(contactSchema, input);
  Object.assign(contact, parsed);
  return contact;
}

export function removeContact(db: Database, session: Session, contactId: string, now: string): void {
  const scope = assertCan(db, session, "vendors.write");
  const contact = db.contacts.find((item) => item.id === contactId && item.organizationId === scope.org.id && !item.deletedAt);
  if (!contact) throw new AppError("not_found", "Contact not found.");
  contact.deletedAt = now;
}

export function refreshVendor(db: Database, vendorId: string): void {
  const vendor = db.vendors.find((item) => item.id === vendorId);
  if (!vendor) return;
  const assessments = db.assessments
    .filter((assessment) => assessment.vendorId === vendorId && !assessment.deletedAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const latest = assessments[0];
  vendor.assessmentStatus = latest?.status ?? "not_started";
  vendor.overallRisk = latest ? (latest.residualOverride ?? latest.residualRisk) : vendor.riskTier;
  vendor.lastAssessmentAt = latest ? latest.updatedAt.slice(0, 10) : vendor.lastAssessmentAt;
}

function buildVendor(organizationId: string, input: VendorInput, now: string): Vendor {
  return {
    id: createId(),
    organizationId,
    name: input.name,
    website: input.website,
    service: input.service,
    category: input.category,
    businessOwner: input.businessOwner,
    securityOwner: input.securityOwner,
    criticality: input.criticality,
    criticalityJustification: "",
    criticalityFactors: emptyCriticalityFactors(),
    dataAccess: input.dataAccess,
    systemAccess: input.systemAccess,
    riskTier: null,
    inherent: null,
    assessmentStatus: "not_started",
    lastAssessmentAt: null,
    nextReviewAt: null,
    reviewFrequency: input.reviewFrequency,
    overallRisk: null,
    notes: input.notes,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

function vendorDueDate(db: Database, vendor: Vendor): string | null {
  const active = db.assessments
    .filter((assessment) => assessment.vendorId === vendor.id && !assessment.deletedAt)
    .filter((assessment) => !["approved", "approved_with_conditions", "rejected", "closed"].includes(assessment.status))
    .map((assessment) => assessment.dueDate)
    .sort();
  return active[0] ?? vendor.nextReviewAt;
}

export function contactsFor(db: Database, organizationId: string, vendorId: string): VendorContact[] {
  return db.contacts.filter((contact) => contact.organizationId === organizationId && contact.vendorId === vendorId && !contact.deletedAt);
}
