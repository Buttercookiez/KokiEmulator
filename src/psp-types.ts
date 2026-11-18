export type PspGame = {
  id: string;
  file: string;
  title: string;
  bytes: number;
  favorite: boolean;
  lastPlayed?: number;
  screenshot?: string;
};
export type PspTiming = { fps: number; sampleRate: number; native?: boolean };
export type PspCheckpoint = { id: string; gameId: string; created: number; bytes: number };
export interface PspBridge {
  games(): Promise<PspGame[]>;
  choose(): Promise<{ games: PspGame[]; errors: string[] }>;
  favorite(id: string): Promise<PspGame[]>;
  remove(id: string): Promise<PspGame[]>;
  saves(): Promise<void>;
  start(id: string): Promise<PspTiming>;
  frame(buttons: number, x: number, y: number): Promise<Uint8Array>;
  checkpoint(restore: boolean, id?: string): Promise<void>;
  checkpoints(): Promise<PspCheckpoint[]>;
  deleteCheckpoint(id: string): Promise<void>;
  screenshot(data: string): Promise<void>;
  stop(): Promise<void>;
}
declare global { interface Window { kokiPsp?: PspBridge } }
