import { IsString, MinLength } from 'class-validator';

export class RequestS3000ExclusionDto {
  @IsString()
  @MinLength(30)
  justification!: string;
}

export class AcceptS3000Dto {
  @IsString()
  receipt!: string;
}
