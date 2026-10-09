import { IsInt, IsString, Min } from 'class-validator';
import { ValidationPipe } from '@nestjs/common';

class ExampleDto {
  @IsString()
  name!: string;

  @IsInt()
  @Min(1)
  count!: number;
}

describe('global ValidationPipe configuration', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
  });

  it('rejects properties that are not declared by a DTO', async () => {
    await expect(
      pipe.transform(
        { name: 'lead', count: 1, brokerId: 'forged' },
        { type: 'body', metatype: ExampleDto, data: undefined },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('transforms valid input into its DTO class', async () => {
    await expect(
      pipe.transform(
        { name: 'lead', count: 2 },
        { type: 'body', metatype: ExampleDto, data: undefined },
      ),
    ).resolves.toBeInstanceOf(ExampleDto);
  });
});
