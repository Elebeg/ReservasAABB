export class TournamentRegistrationResponseDto {
  id: number;
  tournament: {
    id: number;
    name: string;
    date: Date;
    type: string;
  };
  user: {
    id: number;
    name: string;
    email: string;
  };
  status: string;
  registrationDate: Date;
  category?: string;
  partnerEmail?: string;
}