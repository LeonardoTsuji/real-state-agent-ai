import type { INestApplication } from '@nestjs/common';
import { RequestMethod } from '@nestjs/common';
import {
  METHOD_METADATA,
  PARAMTYPES_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants.js';
import { ModulesContainer } from '@nestjs/core';
import {
  DocumentBuilder,
  SwaggerModule,
  type OpenAPIObject,
  type OperationObject,
  type SchemaObject,
} from '@nestjs/swagger';
import { publicSchemas, ref } from './openapi/schemas.js';
import { publicResponse } from './openapi/contracts.js';
import { registerDto, type DtoClass } from './openapi/validation-schema.js';

const httpMethods = new Set([
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'head',
  'options',
]);
type RouteArgument = { index: number; data?: string };
const paths = (value: unknown): string[] =>
  Array.isArray(value)
    ? (value as string[])
    : [typeof value === 'string' ? value : ''];

/** Development contracts use runtime validation metadata and an explicit public response registry. */
export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Corretor Copilot')
      .setDescription(
        'CRM pessoal e demonstração comercial. BRL em centavos; datas UTC. Documentação disponível somente fora de produção.',
      )
      .setVersion('1.0.0')
      .addBearerAuth()
      .build(),
  );
  const schemas: Record<string, SchemaObject> = { ...publicSchemas };
  const modules = app.get(ModulesContainer);
  for (const module of modules.values())
    for (const wrapper of module.controllers.values()) {
      const controller = wrapper.metatype;
      if (!controller) continue;
      const prototype = controller.prototype as Record<string, unknown>;
      const controllerPaths = paths(
        Reflect.getMetadata(PATH_METADATA, controller) as unknown,
      );
      for (const methodName of Object.getOwnPropertyNames(prototype)) {
        const handler = prototype[methodName];
        if (typeof handler !== 'function') continue;
        const verb = Reflect.getMetadata(METHOD_METADATA, handler) as
          RequestMethod | undefined;
        if (verb === undefined) continue;
        const method = RequestMethod[verb].toLowerCase();
        const handlerPaths = paths(
          Reflect.getMetadata(PATH_METADATA, handler) as unknown,
        );
        const paramTypes = Reflect.getMetadata(
          PARAMTYPES_METADATA,
          prototype,
          methodName,
        ) as unknown[] | undefined;
        const argumentsMetadata = Reflect.getMetadata(
          ROUTE_ARGS_METADATA,
          controller,
          methodName,
        ) as Record<string, RouteArgument> | undefined;
        for (const base of controllerPaths)
          for (const local of handlerPaths) {
            const path = ['/api', base, local]
              .join('/')
              .replace(/\/+/g, '/')
              .replace(/\/$/, '')
              .replace(/:([^/]+)/g, '{$1}');
            const pathItem = document.paths[path];
            const operation = pathItem?.[method as 'get'];
            if (!operation) continue;
            for (const [argumentKey, argument] of Object.entries(
              argumentsMetadata ?? {},
            )) {
              const kind = Number(argumentKey.split(':')[0]),
                ctor = paramTypes?.[argument.index];
              if (
                (kind === 3 || kind === 4) &&
                typeof ctor === 'function' &&
                ctor !== String &&
                ctor !== Object
              ) {
                const dto = ctor as DtoClass,
                  name = `${controller.name}${dto.name}`;
                const schema = registerDto(dto, name, schemas);
                if (kind === 3)
                  operation.requestBody = {
                    required: true,
                    content: { 'application/json': { schema: ref(name) } },
                  };
                else {
                  operation.parameters ??= [];
                  operation.parameters = operation.parameters.filter(
                    (parameter) =>
                      '$ref' in parameter || parameter.in !== 'query',
                  );
                  for (const [property, value] of Object.entries(
                    schema.properties ?? {},
                  )) {
                    operation.parameters.push({
                      in: 'query',
                      name: property,
                      required: schema.required?.includes(property) ?? false,
                      schema: value,
                    });
                  }
                }
              }
            }
          }
      }
    }
  document.components ??= {};
  document.components.schemas = schemas;
  for (const [path, pathItem] of Object.entries(document.paths))
    for (const [method, candidate] of Object.entries(pathItem ?? {})) {
      if (
        !httpMethods.has(method) ||
        typeof candidate !== 'object' ||
        !candidate
      )
        continue;
      const operation = candidate as OperationObject;
      const publicRoute =
        /\/auth\/(login|register)$/.test(path) || path.includes('/health/');
      if (!publicRoute) operation.security = [{ bearer: [] }];
      else operation.security = [];
      const existingSuccess = Object.keys(operation.responses).find((status) =>
        /^2\d\d$/.test(status),
      );
      const success = existingSuccess ?? (method === 'post' ? '201' : '200');
      const contentType = path.endsWith('/pdf')
        ? 'application/pdf'
        : 'application/json';
      operation.responses = {
        [success]: {
          description: 'Successful response',
          ...(success === '204'
            ? {}
            : {
                content: {
                  [contentType]: { schema: publicResponse(path, method) },
                },
              }),
        },
        '400': {
          description: 'Invalid request',
          content: { 'application/json': { schema: ref('PublicError') } },
        },
        '409': {
          description: 'Conflict or resource already changed',
          content: { 'application/json': { schema: ref('PublicError') } },
        },
        '429': {
          description: 'Request limit exceeded',
          content: { 'application/json': { schema: ref('PublicError') } },
        },
        ...(!publicRoute
          ? {
              '401': {
                description: 'Authentication required',
                content: { 'application/json': { schema: ref('PublicError') } },
              },
              '403': {
                description: 'Permission or demo mode required',
                content: { 'application/json': { schema: ref('PublicError') } },
              },
              '404': {
                description: 'Resource not found in current scope',
                content: { 'application/json': { schema: ref('PublicError') } },
              },
            }
          : {}),
      };
      if (
        method === 'post' &&
        (/\/(scheduling\/(reservations|blocks)|commercial\/opportunities\/[^/]+\/(proposal|accept)|commercial\/installments\/[^/]+\/pay|conversations\/[^/]+\/messages)$/.test(
          path,
        ) ||
          path === '/api/visits' ||
          path === '/api/leads/import')
      ) {
        operation.parameters ??= [];
        operation.parameters = operation.parameters.filter(
          (parameter) =>
            '$ref' in parameter ||
            !(
              parameter.in === 'header' &&
              parameter.name.toLowerCase() === 'idempotency-key'
            ),
        );
        operation.parameters.push({
          in: 'header',
          name: 'Idempotency-Key',
          required: path !== '/api/visits' && path !== '/api/leads/import',
          schema: { type: 'string', minLength: 1, maxLength: 120 },
          description: 'Reuse the same logical key for manual retries.',
        });
      }
    }
  return document;
}
export function configureOpenApi(app: INestApplication) {
  if (process.env.NODE_ENV === 'production') return;
  const document = createOpenApiDocument(app);
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs-json',
  });
  return document;
}
