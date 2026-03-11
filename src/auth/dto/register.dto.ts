import { IsEmail, IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class RegisterDto {
  @IsString({ message: 'Nome inválido' })
  @MinLength(2, { message: 'Nome deve ter no mínimo 2 caracteres' })
  @MaxLength(100)
  name: string;

  @IsEmail({}, { message: 'E-mail inválido' })
  @MaxLength(254)
  email: string;

  @IsString()
  @MinLength(8, { message: 'Senha deve ter no mínimo 8 caracteres' })
  @MaxLength(128)
  @Matches(/^(?=.*[a-zA-Z])(?=.*[0-9])/, {
    message: 'Senha deve conter ao menos uma letra e um número',
  })
  password: string;
}
