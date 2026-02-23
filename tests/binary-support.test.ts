import { describe, it, expect } from 'vitest';
import type { RequestBody, MethodResponse, Method } from '../ir/types.js';

describe('Binary support', () => {
  describe('IR types', () => {
    it('RequestBody supports binary flag', () => {
      const body: RequestBody = {
        contentType: 'multipart/form-data',
        required: true,
        type: { kind: 'primitive', type: 'string', format: 'binary' },
        binary: true,
      };
      expect(body.binary).toBe(true);
    });

    it('MethodResponse supports binary flag', () => {
      const response: MethodResponse = {
        statusCode: 200,
        contentType: 'application/octet-stream',
        type: { kind: 'primitive', type: 'string', format: 'binary' },
        binary: true,
      };
      expect(response.binary).toBe(true);
    });

    it('binary flags default to undefined when not set', () => {
      const body: RequestBody = {
        contentType: 'application/json',
        required: true,
        type: { kind: 'model', name: 'Course' },
      };
      expect(body.binary).toBeUndefined();

      const response: MethodResponse = {
        statusCode: 200,
        contentType: 'application/json',
        type: { kind: 'model', name: 'Course' },
      };
      expect(response.binary).toBeUndefined();
    });
  });

  describe('binary method detection', () => {
    it('detects upload methods', () => {
      const method: Method = {
        name: 'createAttachment',
        kind: 'create',
        operationId: 'CreateContentAttachment',
        httpMethod: 'POST',
        path: '/v1/courses/{courseId}/contents/{contentId}/attachments',
        pathParams: [],
        queryParams: [],
        requestBody: {
          contentType: 'multipart/form-data',
          required: true,
          type: { kind: 'primitive', type: 'string', format: 'binary' },
          binary: true,
        },
        response: { statusCode: 200, type: { kind: 'model', name: 'Attachment' } },
        paginated: false,
      };

      expect(method.requestBody?.binary).toBe(true);
      expect(method.response.binary).toBeUndefined();
    });

    it('detects download methods', () => {
      const method: Method = {
        name: 'getAttachment',
        kind: 'get',
        operationId: 'GetContentAttachment',
        httpMethod: 'GET',
        path: '/v1/courses/{courseId}/contents/{contentId}/attachments/{attachmentId}',
        pathParams: [],
        queryParams: [],
        response: {
          statusCode: 200,
          contentType: 'application/octet-stream',
          type: { kind: 'primitive', type: 'string', format: 'binary' },
          binary: true,
        },
        paginated: false,
      };

      expect(method.requestBody?.binary).toBeUndefined();
      expect(method.response.binary).toBe(true);
    });

    it('identifies non-binary methods correctly', () => {
      const method: Method = {
        name: 'list',
        kind: 'list',
        operationId: 'GetCourses',
        httpMethod: 'GET',
        path: '/v1/courses',
        pathParams: [],
        queryParams: [],
        response: {
          statusCode: 200,
          contentType: 'application/json',
          type: { kind: 'model', name: 'Course' },
        },
        paginated: false,
      };

      const isBinary = method.requestBody?.binary || method.response.binary;
      expect(isBinary).toBeFalsy();
    });
  });
});
