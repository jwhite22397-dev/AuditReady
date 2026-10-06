import { z } from "zod";
import {
  ASSESSMENT_TYPES,
  CRITICALITIES,
  DATA_ACCESS_LEVELS,
  DECISIONS,
  DOCUMENT_TYPES,
  FINDING_STATUSES,
  REVIEW_FREQUENCIES,
  REVIEW_RESULTS,
  RISK_LEVELS,
  ROLES,
  SYSTEM_ACCESS_LEVELS,
  VENDOR_CATEGORIES,
  type InherentAnswers,
} from "./types";

const requiredText = (label: string, max = 200) =>
  z.string().trim().min(1, `${label} is required.`).max(max, `${label} is too long.`);

const optionalText = (max = 4000) => z.string().trim().max(max).default("");

export const emailSchema = z.email("Enter a valid email address.");

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(200)
  .refine((value) => /[A-Za-z]/.test(value) && /\d/.test(value), "Include a letter and a number.");

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required.").max(200),
});

export const signUpSchema = z.object({
  fullName: requiredText("Name", 120),
  email: emailSchema,
  password: passwordSchema,
});

export const organizationSchema = z.object({
  name: requiredText("Company name", 160),
  jobTitle: requiredText("Your role", 120),
});

export const vendorSchema = z.object({
  name: requiredText("Vendor name", 160),
  website: z
    .string()
    .trim()
    .max(300)
    .refine((value) => value === "" || /^https?:\/\/\S+$/i.test(value), "Enter a full http(s) URL or leave it blank."),
  service: requiredText("Service or product", 200),
  category: z.enum(VENDOR_CATEGORIES),
  businessOwner: optionalText(160),
  securityOwner: optionalText(160),
  criticality: z.enum(CRITICALITIES),
  dataAccess: z.enum(DATA_ACCESS_LEVELS),
  systemAccess: z.enum(SYSTEM_ACCESS_LEVELS),
  reviewFrequency: z.enum(REVIEW_FREQUENCIES),
  notes: optionalText(8000),
});

export const contactSchema = z.object({
  name: requiredText("Name", 160),
  title: optionalText(160),
  email: z.union([emailSchema, z.literal("")]),
  contactRole: requiredText("Contact role", 80),
});

export const criticalitySchema = z.object({
  criticality: z.enum(CRITICALITIES),
  criticalityJustification: optionalText(2000),
  sensitiveData: z.boolean(),
  productionAccess: z.boolean(),
  businessDependency: z.boolean(),
  privilegedAccess: z.boolean(),
  customerData: z.boolean(),
  financialImpact: z.boolean(),
});

export const inherentSchema = z.object({
  customerData: z.boolean(),
  pii: z.boolean(),
  payment: z.boolean(),
  productionAccess: z.boolean(),
  privilegedAccess: z.boolean(),
  operationallyCritical: z.boolean(),
  hostsData: z.boolean(),
  subprocessors: z.boolean(),
  override: z.enum(RISK_LEVELS).nullable(),
  overrideJustification: optionalText(2000),
});

export const assessmentSchema = z.object({
  vendorId: z.string().uuid("Choose a vendor."),
  name: requiredText("Assessment name", 200),
  type: z.enum(ASSESSMENT_TYPES),
  ownerId: z.string().uuid("Choose an owner."),
  templateId: z.string().uuid("Choose a questionnaire."),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a due date."),
});

export const reviewSchema = z.object({
  result: z.enum(REVIEW_RESULTS),
  notes: optionalText(4000),
});

export const decisionSchema = z.object({
  decision: z.enum(DECISIONS),
  notes: requiredText("Decision notes", 8000),
  requiresSecondaryApproval: z.boolean(),
});

export const overrideSchema = z.object({
  level: z.enum(RISK_LEVELS).nullable(),
  justification: optionalText(2000),
});

export const findingSchema = z.object({
  title: requiredText("Title", 200),
  vendorId: z.string().uuid(),
  assessmentId: z.string().uuid().nullable().optional(),
  assessmentQuestionId: z.string().uuid().nullable().optional(),
  description: requiredText("Description", 8000),
  risk: z.enum(RISK_LEVELS),
  recommendation: optionalText(8000),
  vendorResponse: optionalText(8000),
  ownerId: z.string().uuid().nullable().optional(),
  status: z.enum(FINDING_STATUSES).optional(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export const remediationSchema = z.object({
  requiredAction: requiredText("Required action", 8000),
  vendorResponse: optionalText(8000),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status: z.enum(["open", "in_progress", "ready_for_verification", "verified"]),
});

export const riskAcceptanceSchema = z.object({
  businessJustification: requiredText("Business justification", 8000),
  compensatingControls: requiredText("Compensating controls", 8000),
  expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a review date."),
});

export const questionSchema = z.object({
  sectionId: z.string().uuid(),
  prompt: requiredText("Question", 1000),
  helpText: optionalText(2000),
  type: z.enum(["yes_no", "yes_no_na", "text", "multiple_choice", "file_request"]),
  options: z.array(z.string().trim().min(1).max(200)).max(12).default([]),
  riskWeight: z.number().int().min(1).max(5),
  evidenceRequired: z.boolean(),
  guidance: optionalText(2000),
  controlRef: optionalText(80),
});

export const templateSchema = z.object({
  name: requiredText("Template name", 160),
  description: optionalText(2000),
});

export const inviteSchema = z.object({
  email: emailSchema,
  role: z.enum(["admin", "analyst", "viewer"]),
});

export const memberRoleSchema = z.object({
  role: z.enum(ROLES),
});

export const soc2Schema = z.object({
  reportType: z.enum(["type_i", "type_ii", ""]),
  auditFirm: optionalText(200),
  periodStart: z.string().max(20),
  periodEnd: z.string().max(20),
  opinion: z.enum(["unqualified", "qualified", "adverse", "disclaimer", ""]),
  exceptionsNoted: z.boolean().nullable(),
  subserviceOrganizations: optionalText(4000),
  complementaryUserEntityControls: optionalText(4000),
  coversSecurity: z.boolean(),
  coversAvailability: z.boolean(),
  coversConfidentiality: z.boolean(),
  coversProcessingIntegrity: z.boolean(),
  coversPrivacy: z.boolean(),
  analystNotes: optionalText(8000),
  reviewStatus: z.enum(["not_started", "in_review", "complete"]),
});

export const documentMetaSchema = z.object({
  documentType: z.enum(DOCUMENT_TYPES),
  description: optionalText(2000),
  reviewStatus: z.enum(["pending", "accepted", "rejected", "needs_update"]).optional(),
});

export type VendorInput = z.infer<typeof vendorSchema>;
export type ContactInput = z.infer<typeof contactSchema>;
export type AssessmentInput = z.infer<typeof assessmentSchema>;
export type FindingInput = z.infer<typeof findingSchema>;
export type QuestionInput = z.infer<typeof questionSchema>;

export function zodMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the form and try again.";
}

export function inherentAnswersFrom(input: z.infer<typeof inherentSchema>): InherentAnswers {
  return {
    customerData: input.customerData,
    pii: input.pii,
    payment: input.payment,
    productionAccess: input.productionAccess,
    privilegedAccess: input.privilegedAccess,
    operationallyCritical: input.operationallyCritical,
    hostsData: input.hostsData,
    subprocessors: input.subprocessors,
  };
}
