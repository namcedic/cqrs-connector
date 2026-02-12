import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaginationDto {
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.trim() !== '')
      return parseInt(value, 10);
    return undefined;
  })
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.trim() !== '')
      return parseInt(value, 10);
    return undefined;
  })
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
