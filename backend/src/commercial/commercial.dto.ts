import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../common/pagination.dto.js';
export const COMMERCIAL_STAGES = [
  'FIRST_CONTACT',
  'QUALIFICATION',
  'VISIT_SCHEDULED',
  'PROPOSAL_SENT',
  'WON',
  'LOST',
] as const;
export class CreateOpportunityDto {
  @IsUUID() leadId!: string;
  @IsOptional() @IsUUID() propertyId?: string | null;
  @IsOptional() @IsUUID() alternativePropertyId?: string | null;
  @IsInt() @Min(1) @Max(2147483647) estimatedValueCents!: number;
  @IsOptional() @IsInt() @Min(0) @Max(10000) commissionBps?: number;
  @IsOptional() @IsString() @Length(1, 200) title?: string | null;
  @IsOptional() @IsIn(COMMERCIAL_STAGES) stage?: string;
}
export class PatchOpportunityDto {
  @IsOptional() @IsUUID() propertyId?: string | null;
  @IsOptional() @IsUUID() alternativePropertyId?: string | null;
  @IsOptional() @IsInt() @Min(1) @Max(2147483647) estimatedValueCents?: number;
  @IsOptional() @IsInt() @Min(0) @Max(10000) commissionBps?: number;
  @IsOptional() @IsString() @Length(1, 200) title?: string | null;
  @IsOptional() @IsIn(COMMERCIAL_STAGES) stage?: string;
}
export class OpportunitiesQueryDto extends PaginationQueryDto {
  @IsOptional() @IsIn(COMMERCIAL_STAGES) stage?: string;
  @IsOptional() @IsUUID() leadId?: string;
  @IsOptional() @IsString() @Length(1, 200) q?: string;
}
export class InstallmentInputDto {
  @IsInt() @Min(1) @Max(2147483647) amountCents!: number;
  @IsOptional() @IsDateString() dueAt?: string;
}
export class ProposalDto {
  @IsInt() @Min(1) @Max(2147483647) valueCents!: number;
  @IsDateString() validUntil!: string;
  @IsString() @Length(1, 2000) paymentTerms!: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @Length(1, 2000, { each: true })
  clauses?: string[];
  @IsString() @Length(1, 120) sellerName!: string;
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(36)
  @ValidateNested({ each: true })
  @Type(() => InstallmentInputDto)
  installments?: InstallmentInputDto[];
}
export class AcceptDto {
  @IsBoolean() @Equals(true) confirmed!: boolean;
  @IsBoolean() @Equals(true) simulated!: boolean;
}
export class SimulatePaymentDto {
  @IsBoolean() @Equals(true) simulated!: boolean;
}
export class CreateDocumentDto {
  @IsOptional() @IsUUID() opportunityId?: string;
  @IsOptional() @IsUUID() installmentId?: string;
  @IsOptional() @IsUUID() propertyId?: string;
  @IsOptional() @IsUUID() visitId?: string;
  @IsIn(['DOSSIER', 'REPORT', 'VISIT_REPORT', 'DRAFT', 'ACCEPTANCE', 'RECEIPT'])
  kind!: string;
  @IsString() @Length(1, 200) title!: string;
}
