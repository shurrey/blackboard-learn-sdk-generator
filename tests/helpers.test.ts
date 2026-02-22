import { describe, it, expect } from 'vitest';
import { typeRefToTS, methodParams } from '../emitters/typescript/helpers.js';
import { camelCase, pascalCase } from '../emitters/shared/case-utils.js';
import type { TypeRef } from '../ir/types.js';

describe('TypeScript helpers', () => {
  describe('typeRefToTS', () => {
    it('converts primitive types', () => {
      expect(typeRefToTS({ kind: 'primitive', type: 'string' })).toBe('string');
      expect(typeRefToTS({ kind: 'primitive', type: 'integer' })).toBe('number');
      expect(typeRefToTS({ kind: 'primitive', type: 'number' })).toBe('number');
      expect(typeRefToTS({ kind: 'primitive', type: 'boolean' })).toBe('boolean');
    });

    it('converts model references', () => {
      expect(typeRefToTS({ kind: 'model', name: 'Course' })).toBe('Course');
    });

    it('converts arrays', () => {
      expect(typeRefToTS({
        kind: 'array',
        items: { kind: 'model', name: 'Course' },
      })).toBe('Course[]');
    });

    it('converts maps', () => {
      expect(typeRefToTS({
        kind: 'map',
        valueType: { kind: 'primitive', type: 'string' },
      })).toBe('Record<string, string>');
    });

    it('converts void', () => {
      expect(typeRefToTS({ kind: 'void' })).toBe('void');
    });
  });

  describe('camelCase', () => {
    it('converts snake_case', () => {
      expect(camelCase('course_id')).toBe('courseId');
    });

    it('converts kebab-case', () => {
      expect(camelCase('course-id')).toBe('courseId');
    });

    it('preserves camelCase', () => {
      expect(camelCase('courseId')).toBe('courseId');
    });
  });

  describe('pascalCase', () => {
    it('converts to PascalCase', () => {
      expect(pascalCase('courses')).toBe('Courses');
      expect(pascalCase('course_membership')).toBe('CourseMembership');
    });
  });
});
