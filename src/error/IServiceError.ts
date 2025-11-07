export interface IServiceError {
  readonly statusCode: number;
  readonly message: string;
  readonly name: string;
}
