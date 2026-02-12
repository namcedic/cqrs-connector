export interface PaginatedResponse<T> {
  page: number;
  limit: number;
  data: T[];
}
