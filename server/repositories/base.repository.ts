export interface QueryOptions {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
  where?: Array<{
    field: string;
    operator: '==' | '!=' | '<' | '<=' | '>' | '>=' | 'array-contains' | 'in';
    value: unknown;
  }>;
}

export interface IRepository<T extends { id: string }> {
  getById(id: string): Promise<T | null>;
  list(options?: QueryOptions): Promise<T[]>;
  listForTenant(communityId: string, options?: QueryOptions): Promise<T[]>;
  create(item: Omit<T, 'id'> & { id?: string }): Promise<T>;
  update(id: string, updates: Partial<T>): Promise<T>;
  upsert(item: Partial<T> & { id: string }): Promise<T>;
  upsert(id: string, item: Partial<T>): Promise<T>;
  upsert(idOrItem: string | (Partial<T> & { id: string }), maybeItem?: Partial<T>): Promise<T>;
  delete(id: string): Promise<boolean>;
  count(options?: QueryOptions): Promise<number>;
  countForTenant(communityId: string, options?: QueryOptions): Promise<number>;
}
