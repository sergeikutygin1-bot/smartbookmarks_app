/**
 * Vitest setup file
 * Configures jest-dom matchers for Vitest
 */

import { expect } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);
