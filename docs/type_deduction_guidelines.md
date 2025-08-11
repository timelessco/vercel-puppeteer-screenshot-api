# Type Deduction Guidelines

## TypeScript Conventions

- **Strict Mode**: Always enabled, no exceptions
- **Type Safety**:
  - No `any` types
  - No type assertions unless absolutely necessary
  - No `@ts-ignore` without explicit explanation
  - Use `unknown` instead of `any` when type is truly unknown
- **Imports**: Organized with specific order (see prettier config)
- **File Extensions**: `.tsx` for React components, `.ts` for utilities

## Core Principles

1. **Type Deduction**: Deduce from existing types rather than creating custom interfaces
2. **Type Hierarchy**: Types flow from parent to child, never skip levels (no grandparent imports)
3. **Export Discipline**: Only export types that are used in other files

## Best Practices

### 1. Always Check for Existing Types First

Before creating a new type or interface, check if:

- The library already provides a type
- You can deduce it from existing functions
- You can extend or pick from existing types

### 2. Use TypeScript Utility Types

#### Parameters<>

Extract parameter types from functions:

```typescript
// ✅ GOOD - Deduces from existing function
type ConfigOptions = Parameters<SomeLibrary["configure"]>[0];

// ❌ BAD - Recreates what already exists
interface ConfigOptions {
	timeout?: number;
	retries?: number;
	debug?: boolean;
}
```

#### ReturnType<>

Extract return types from functions:

```typescript
// ✅ GOOD - Deduces from factory function
export type ApiClient = ReturnType<typeof createApiClient>;

// ❌ BAD - Manually defining what the function returns
interface ApiClient {
	get: (url: string) => Promise<Response>;
	post: (url: string, data: any) => Promise<Response>;
	// ... etc
}
```

#### Pick<> and Omit<>

Reuse parts of existing types:

```typescript
// ✅ GOOD - Reuses existing RequestConfig
type MinimalRequest = Pick<RequestConfig, "url" | "method"> & {
	customHeader?: string;
};

// ❌ BAD - Redefines properties that exist in RequestConfig
interface MinimalRequest {
	url: string;
	method: "GET" | "POST";
	customHeader?: string;
}
```

#### Awaited<>

Handle promise return types:

```typescript
// ✅ GOOD - Gets the resolved type
type DatabaseConnection = Awaited<ReturnType<typeof connectToDatabase>>;
```

### 3. Type Flow Pattern

Types should cascade from parent to child - see Type Hierarchy Rules section below for detailed examples.

### 4. Extend When Adding Properties

When you need additional properties, extend existing types:

```typescript
// ✅ GOOD - Extends existing type
type ExtendedConfig = BaseConfig & {
	customTimeout?: number;
	retryCount?: number;
};

// ❌ BAD - Recreates all properties
interface ExtendedConfig {
	apiUrl: string;
	apiKey: string;
	customTimeout?: number;
	retryCount?: number;
}
```

### 5. Extract Reusable Types

Extract complex inline types to named types when:

- Used in multiple places
- Complex enough to benefit from documentation
- Likely to be extended or modified

## Common Patterns

### Library Types

Always use the library's built-in types directly

### Factory Function Pattern

When working with factory functions, extract their return types:

```typescript
// If you have a factory function
function createService(config: Config) {
	return {
		start: () => {
			/* ... */
		},
		stop: () => {
			/* ... */
		},
		status: () => "running" as const,
	};
}

// Extract its return type instead of manually defining
export type Service = ReturnType<typeof createService>;
```

## Type Hierarchy Rules

### Parent-Child Type Deduction

Always use types from the immediate parent, never from grandparents.

#### Type Alias for Identical Options

When a child function uses the exact same options as its parent, use a type alias:

```typescript
// Parent defines the options
export interface SetupBrowserPageOptions {
	logger: CreateLoggerReturnType;
	page: GetOrCreatePageReturnType;
}

// Child uses exact same options - use type alias
type SetupAdBlockerOptions = SetupBrowserPageOptions;

export async function setupAdBlocker(
	options: SetupAdBlockerOptions,
): Promise<void> {
	const { logger, page } = options;
	// ...
}
```

#### Interface for Extended Options

Only create a new interface when adding or modifying properties:

```typescript
// Child needs additional properties
export interface ExtendedOptions {
	logger: SetupBrowserPageOptions["logger"]; // Deduce from parent
	page: SetupBrowserPageOptions["page"]; // Deduce from parent
	extraOption: string; // New property
}
```

### Export Rules

Only export types that are used in other files - check with grep before exporting.

## Quick Reference

### DO's and DON'Ts

**DO:**

- ✅ Use type alias when child options = parent options exactly
- ✅ Deduce types from immediate parent (`ParentOptions["property"]`)
- ✅ Check with grep before exporting any type
- ✅ Export return types that are used elsewhere
- ✅ Use TypeScript utility types (Parameters, ReturnType, Pick, etc.)

**DON'T:**

- ❌ Import types from grandparent modules
- ❌ Create unnecessary interfaces when type alias suffices
- ❌ Export internal-only types
- ❌ Skip hierarchy levels (e.g., using `CreateLoggerReturnType` directly in grandchild)
- ❌ Create custom types when you can deduce from existing ones

## Checklist Before Creating a Type

1. ✓ Did I search for existing library types?
2. ✓ Can I use Parameters<> or ReturnType<>?
3. ✓ Can I extend or Pick from an existing type?
4. ✓ Is this type used in multiple places (extract it)?
5. ✓ Are types flowing from parent to child properly?
6. ✓ Am I using types from immediate parent only?
7. ✓ Do I need to export this type (check with grep)?

## References

- [TypeScript Utility Types](https://www.typescriptlang.org/docs/handbook/utility-types.html)
- [TypeScript Handbook - Type Manipulation](https://www.typescriptlang.org/docs/handbook/2/types-from-types.html)
- [TypeScript Deep Dive - Type Inference](https://basarat.gitbook.io/typescript/type-system/type-inference)
