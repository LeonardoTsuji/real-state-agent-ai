import type { components } from "../api/generated/schema";
type PublicSchema = components["schemas"];

export type Page<T> = {
  items: T[];
  page: number;
  limit: number;
  total: number;
};
export type CursorPage<T> = { items: T[]; nextCursor: string | null };
export type LeadStage = PublicSchema["PublicLead"]["stage"];
export type User = PublicSchema["PublicUser"];
export type Preference = PublicSchema["PublicPreference"];
export type LeadPreference = Preference;
export type Lead = PublicSchema["PublicLead"]; // Public CRM response from the generated contract.
export type Property = PublicSchema["PublicProperty"];
export type Compatibility = PublicSchema["PublicCompatibility"];
export type Match = PublicSchema["PublicMatch"];
export type Interaction = PublicSchema["PublicInteraction"];
export type Visit = Omit<
  PublicSchema["PublicVisit"],
  "lead" | "property" | "feedback" | "feedbackDraft"
> & {
  lead?: Lead;
  property?: Property;
  feedback?: any;
  feedbackDraft?: any;
  calendarEvent?: any;
};
export type Reservation = Omit<
  PublicSchema["PublicReservation"],
  "lead" | "property"
> & { lead?: Lead; property?: Property; message?: string | null };
export type Task = PublicSchema["PublicTask"];
export type Opportunity = PublicSchema["PublicOpportunity"] & {
  lead?: Lead;
  property?: Property;
  alternativeProperty?: Property;
  installments?: Installment[];
};
export type Installment = PublicSchema["PublicInstallment"];
export type CommercialDocument = Omit<
  PublicSchema["PublicDocument"],
  "snapshot"
> & { snapshot: any };
export type Conversation = PublicSchema["PublicConversation"];
export type Message = PublicSchema["PublicMessage"];
export type Proposal = PublicSchema["PublicProposal"];
