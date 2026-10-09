import { getMetadataStorage } from 'class-validator';
import type { SchemaObject } from '@nestjs/swagger';
import { InstallmentInputDto } from '../commercial/commercial.dto.js';
import { ref } from './schemas.js';

export type DtoClass = new () => object;
/** Read runtime validators rather than compiler-generated CommonJS factories. */
export function registerDto(
  ctor: DtoClass,
  name: string,
  schemas: Record<string, SchemaObject>,
): SchemaObject {
  const metadata = getMetadataStorage().getTargetValidationMetadatas(
    ctor,
    '',
    false,
    false,
  );
  const properties: NonNullable<SchemaObject['properties']> = {};
  const required: string[] = [];
  const instance = new ctor() as Record<string, unknown>;
  const schema: SchemaObject = {
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  };
  schemas[name] = schema;
  const names = [...new Set(metadata.map((item) => item.propertyName))];
  for (const property of names) {
    const validations = metadata.filter(
      (item) => item.propertyName === property,
    );
    const optional = validations.some(
      (item) => item.type === 'conditionalValidation',
    );
    if (!optional) required.push(property);
    const field: SchemaObject = {};
    const reflected = Reflect.getMetadata(
      'design:type',
      ctor.prototype as object,
      property,
    ) as unknown;
    if (reflected === String) field.type = 'string';
    else if (reflected === Number) field.type = 'number';
    else if (reflected === Boolean) field.type = 'boolean';
    else if (reflected === Array) {
      field.type = 'array';
      field.items = {};
    } else {
      field.type = 'object';
      field.additionalProperties = true;
    }
    for (const item of validations) {
      const target = item.each ? ((field.items ??= {}) as SchemaObject) : field;
      const constraints = item.constraints as unknown[] | undefined;
      const first = constraints?.[0],
        second = constraints?.[1];
      switch (item.name) {
        case 'isString':
        case 'isNotEmpty':
          target.type = 'string';
          break;
        case 'isInt':
          target.type = 'integer';
          break;
        case 'isNumber':
          target.type = 'number';
          break;
        case 'isBoolean':
          target.type = 'boolean';
          break;
        case 'isUuid':
          target.type = 'string';
          target.format = 'uuid';
          break;
        case 'isEmail':
          target.type = 'string';
          target.format = 'email';
          break;
        case 'isDateString':
          target.type = 'string';
          target.format = 'date-time';
          break;
        case 'isTimeZone':
          target.type = 'string';
          target.example = 'America/Sao_Paulo';
          break;
        case 'isObject':
          target.type = 'object';
          target.additionalProperties = true;
          break;
        case 'isArray':
          field.type = 'array';
          field.items ??= {};
          break;
        case 'isEnum':
          target.type = 'string';
          target.enum = Array.isArray(second)
            ? (second as string[])
            : Object.values(first as Record<string, string>);
          break;
        case 'isIn':
          target.enum = first as unknown[];
          target.type =
            typeof (first as unknown[])[0] === 'number' ? 'number' : 'string';
          break;
        case 'equals':
          target.enum = [first];
          break;
        case 'min':
          if (typeof first === 'number') target.minimum = first;
          break;
        case 'max':
          if (typeof first === 'number') target.maximum = first;
          break;
        case 'isLength':
        case 'length':
          if (typeof first === 'number') target.minLength = first;
          if (typeof second === 'number') target.maxLength = second;
          break;
        case 'maxLength':
          if (typeof first === 'number') target.maxLength = first;
          break;
        case 'arrayMaxSize':
          if (typeof first === 'number') field.maxItems = first;
          break;
        case 'arrayMinSize':
          if (typeof first === 'number') field.minItems = first;
          break;
        case 'matches':
          if (first instanceof RegExp) target.pattern = first.source;
          break;
      }
      if (
        item.type === 'nestedValidation' &&
        typeof reflected === 'function' &&
        reflected !== Array &&
        reflected !== Object
      ) {
        const nested = reflected as DtoClass;
        if (!schemas[nested.name]) registerDto(nested, nested.name, schemas);
        field.type = 'object';
        delete field.additionalProperties;
        field.allOf = [ref(nested.name)];
      }
    }
    if (ctor.name === 'ProposalDto' && property === 'installments') {
      if (!schemas.InstallmentInputDto)
        registerDto(InstallmentInputDto, 'InstallmentInputDto', schemas);
      field.items = ref('InstallmentInputDto');
    }
    if (instance[property] !== undefined) field.default = instance[property];
    if (validations.some((item) => item.name === 'isOptional'))
      field.nullable = true;
    if (field.type !== 'object') delete field.additionalProperties;
    properties[property] = field;
  }
  return schema;
}
