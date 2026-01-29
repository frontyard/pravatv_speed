import type { Request, Response } from "express";
import * as crypto from "crypto";
import type { ModulePlugin } from "pravatv_services";

const envInt = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const plugin: ModulePlugin = {
  config: {
    name: "speed",
    basePath: "/speed",
    request: {
      disableBodyParser: true,
    },
    response: {
      maxBytes: 100 * 1024 * 1024,
    },
    rateLimit: {
      windowMs: 60 * 1000,
      max: 10,
      message: { error: "Too many requests, please try again later" },
      standardHeaders: true,
      legacyHeaders: false,
    },
  },
  register(router, logger) {
    const DEFAULT_SIZE = envInt("DEFAULT_SIZE", 10 * 1024 * 1024);
    const MAX_DOWNLOAD = envInt("MAX_DOWNLOAD", 100 * 1024 * 1024);
    const MAX_UPLOAD = envInt("MAX_UPLOAD", 100 * 1024 * 1024);

    router.options("/download", (_req: Request, res: Response) => {
      res.status(204).end();
    });

    router.get("/download", (req: Request, res: Response) => {
      try {
        const qSize = String(req.query.size ?? "");
        let size = Number.parseInt(qSize, 10);
        if (!Number.isFinite(size) || size <= 0) size = DEFAULT_SIZE;
        if (size > MAX_DOWNLOAD) size = MAX_DOWNLOAD;

        const CHUNK = 64 * 1024;
        let remaining = size;
        const total = size;
        const start = Date.now();
        const reqId = crypto.randomUUID();

        logger.debug(`/download start: reqId=${reqId} requested=${qSize} total =${total}`);

        res.status(200);
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Content-Length", String(total));

        let ended = false;

        const endOnce = () => {
          if (ended) return;
          ended = true;
          const millis = Date.now() - start;
          logger.debug(`/download end: reqId=${reqId} size=${total} millis=${millis}`);
        };

        const abortOnce = () => {
          if (ended) return;
          if (remaining <= 0 || res.writableEnded) {
            return;
          }
          ended = true;
          logger.warn(`/download abort: reqId=${reqId}`);
        };

        res.on("finish", endOnce);
        req.on("aborted", abortOnce);
        res.on("close", () => {
          if (remaining > 0) abortOnce();
        });
        res.on("error", (err: unknown) => {
          logger.error(
            `/download error: err=${err instanceof Error ? err.message : String(err)}`,
          );
          abortOnce();
        });
        const writeMore = () => {
          if (ended) return;

          while (remaining > 0) {
            const len = Math.min(CHUNK, remaining);
            remaining -= len;

            const buf = Buffer.allocUnsafe(len);
            crypto.randomFillSync(buf);

            const ok = res.write(buf);
            if (!ok) {
              res.once("drain", writeMore);
              return;
            }
          }

          res.end();
          endOnce();
        };

        writeMore();
      } catch (err) {
        logger.warn(`/download failed reason=${err instanceof Error ? err.message : String(err)}`);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    router.options("/upload", (_req: Request, res: Response) => {
      res.status(204).end();
    });

    router.post("/upload", (req: Request, res: Response) => {
      try {
        const start = Date.now();
        let bytes = 0;

        const reqId = crypto.randomUUID();
        logger.debug(`/upload start: reqId=${reqId}`);

        let finished = false;
        const finishOnce = (fn: () => void) => {
          if (finished) return;
          finished = true;
          fn();
        };

        req.on("aborted", () => {
          finishOnce(() => {
            logger.warn(`/upload abort: reqId=${reqId}`);
          });
        });

        req.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > MAX_UPLOAD) {
            req.pause();
            finishOnce(() => {
              const millis = Date.now() - start;
              logger.warn(`/upload too_large: reqId=${reqId} bytes=${bytes} millis=${millis}`);
              res
                .status(413)
                .type("application/json")
                .send(
                  JSON.stringify({
                    message: "Payload too large",
                    max: MAX_UPLOAD,
                  }),
                );
              req.destroy();
            });
          }
        });

        req.on("end", () => {
          finishOnce(() => {
            const millis = Date.now() - start;
            logger.debug(`/upload end: reqId=${reqId} bytes=${bytes} millis=${millis}`);
            res.status(200).json({ bytes, millis });
          });
        });

        req.on("error", (err: unknown) => {
          finishOnce(() => {
            logger.error(`/upload error: err=${err}`);
            res
              .status(500)
              .type("application/json")
              .send(JSON.stringify({ message: "Failed to receive upload" }));
          });
        });
      } catch (err) {
        logger.error(`/upload failed reason=${err instanceof Error ? err.message : String(err)}`);
        res.status(500).json({ error: "Internal server error" });
      }
    });
  },
};

export default plugin;
