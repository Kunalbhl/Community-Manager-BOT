import { Request, Response } from 'express';

export function createModulePlaceholder(moduleName: string) {
  return (req: Request, res: Response) => {
    res.status(501).json({
      success: false,
      code: 'MODULE_NOT_IMPLEMENTED',
      message: 'This module will be implemented in a later development task.',
      module: moduleName,
      phase: 'TASK_1_FOUNDATION',
      requestId: req.id,
    });
  };
}
