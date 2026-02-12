export class GetUsersQuery {
  constructor(
    public readonly page: number,
    public readonly limit: number,
  ) {}
}
