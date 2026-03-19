import { describe, it, expect } from 'vitest';
import { classifyMethod, disambiguateMethodName } from '../ir/method-classifier.js';

describe('classifyMethod', () => {
  it('classifies GET without param as list', () => {
    const result = classifyMethod({ httpMethod: 'GET', path: '/courses' });
    expect(result).toEqual({ kind: 'list', name: 'list' });
  });

  it('classifies GET with param as get', () => {
    const result = classifyMethod({ httpMethod: 'GET', path: '/courses/{courseId}' });
    expect(result).toEqual({ kind: 'get', name: 'get' });
  });

  it('classifies POST as create', () => {
    const result = classifyMethod({ httpMethod: 'POST', path: '/courses' });
    expect(result).toEqual({ kind: 'create', name: 'create' });
  });

  it('classifies PATCH as update', () => {
    const result = classifyMethod({ httpMethod: 'PATCH', path: '/courses/{courseId}' });
    expect(result).toEqual({ kind: 'update', name: 'update' });
  });

  it('classifies PUT as replace', () => {
    const result = classifyMethod({ httpMethod: 'PUT', path: '/courses/{courseId}' });
    expect(result).toEqual({ kind: 'replace', name: 'replace' });
  });

  it('classifies DELETE as delete', () => {
    const result = classifyMethod({ httpMethod: 'DELETE', path: '/courses/{courseId}' });
    expect(result).toEqual({ kind: 'delete', name: 'delete' });
  });
});

describe('disambiguateMethodName', () => {
  it('returns base name when no conflict', () => {
    const result = disambiguateMethodName('list', '/courses', new Set());
    expect(result).toBe('list');
  });

  it('appends path segment when conflict exists', () => {
    const result = disambiguateMethodName('create', '/courses/{courseId}/copy', new Set(['create']));
    expect(result).toBe('create_copy');
  });

  it('appends counter as fallback', () => {
    const existing = new Set(['create', 'create_copy']);
    const result = disambiguateMethodName('create', '/courses/{courseId}/copy', existing);
    expect(result).toBe('create_2');
  });
});
