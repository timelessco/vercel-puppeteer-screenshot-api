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

## Core Principle

Types should flow from top to bottom (parent to child functions), and we should deduce from existing library types whenever possible rather than creating custom interfaces.

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

Types should cascade from parent to child:

```typescript
// Parent function defines/imports types
async function processData<T>(
	data: T,
	transformer: (item: T) => Promise<ProcessedData>,
) {
	// Child function receives typed parameters
	return await transformAndValidate(data, transformer);
}

// Child uses parent's types, no redefinition
async function transformAndValidate<T>(
	data: T,
	transformer: (item: T) => Promise<ProcessedData>,
) {
	const result = await transformer(data);
	return validate(result);
}
```

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

Don't leave complex types inline:

```typescript
// ✅ GOOD - Named, reusable type
type PaginationOptions = {
	page?: number;
	limit?: number;
	sortBy?: string;
	order?: "asc" | "desc";
};

function fetchData(url: string, options?: PaginationOptions) {}

// ❌ BAD - Inline, not reusable
function fetchData(
	url: string,
	options?: {
		page?: number;
		limit?: number;
		sortBy?: string;
		order?: "asc" | "desc";
	},
) {}
```

## Common Patterns

### Library Types

Always use the library's built-in types directly:

- Import types directly from the library when available
- Use the library's type definitions for configuration objects
- Leverage library-provided interfaces and types for callbacks and handlers

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

### Options Objects

Extract complex inline types to named types when:

- Used in multiple places
- Complex enough to benefit from documentation
- Likely to be extended or modified

## Checklist Before Creating a Type

1. ✓ Did I search for existing library types?
2. ✓ Can I use Parameters<> or ReturnType<>?
3. ✓ Can I extend or Pick from an existing type?
4. ✓ Is this type used in multiple places (extract it)?
5. ✓ Are types flowing from parent to child properly?

## References

- [TypeScript Utility Types](https://www.typescriptlang.org/docs/handbook/utility-types.html)
- [TypeScript Handbook - Type Manipulation](https://www.typescriptlang.org/docs/handbook/2/types-from-types.html)
- [TypeScript Deep Dive - Type Inference](https://basarat.gitbook.io/typescript/type-system/type-inference)
