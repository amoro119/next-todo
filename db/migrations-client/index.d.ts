import { PGlite } from '@electric-sql/pglite';
export declare function migrate(db: PGlite): Promise<void>;
export declare function postInitialSync(_db: PGlite): Promise<void>;
