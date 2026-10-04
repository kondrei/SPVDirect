import type { Response } from 'express';
import { RegistrationsController } from './registrations.controller.js';
import type {
  PendingRegistration,
  RegistrationsService,
} from './services/registrations.service.js';

const pending: PendingRegistration = {
  id: 7,
  email: 'x@example.com',
  name: '<script>',
  createdAt: new Date('2026-09-28T10:00:00Z'),
};

function setup(found: PendingRegistration | null = pending) {
  const registrations = {
    findPending: vi.fn().mockResolvedValue(found),
    approve: vi.fn().mockResolvedValue(found),
    reject: vi.fn().mockResolvedValue(found),
  };
  const res = {
    status: vi.fn(() => res),
    type: vi.fn(() => res),
    send: vi.fn(() => res),
  };
  const controller = new RegistrationsController(
    registrations as unknown as RegistrationsService,
  );
  const html = () => res.send.mock.calls[0][0] as string;
  return {
    controller,
    registrations,
    res: res as unknown as Response,
    status: res.status,
    html,
  };
}

describe('RegistrationsController', () => {
  it('shows a confirmation form on GET instead of acting', async () => {
    const { controller, registrations, res, html } = setup();
    await controller.confirmApprove('tok', res);
    expect(registrations.approve).not.toHaveBeenCalled();
    expect(html()).toContain(
      '<form method="post" action="/auth/registrations/tok/approve">',
    );
    expect(html()).toContain('&lt;script&gt;');
    expect(html()).not.toContain('<script>');
  });

  it('shows the reject confirmation with a danger button', async () => {
    const { controller, registrations, res, html } = setup();
    await controller.confirmReject('tok', res);
    expect(registrations.reject).not.toHaveBeenCalled();
    expect(html()).toContain('action="/auth/registrations/tok/reject"');
    expect(html()).toContain('btn btn-danger');
  });

  it('approves on POST', async () => {
    const { controller, registrations, res, html } = setup();
    await controller.approve('tok', res);
    expect(registrations.approve).toHaveBeenCalledWith('tok');
    expect(html()).toContain('Cont aprobat');
  });

  it('rejects on POST', async () => {
    const { controller, registrations, res, html } = setup();
    await controller.reject('tok', res);
    expect(registrations.reject).toHaveBeenCalledWith('tok');
    expect(html()).toContain('Cerere respinsă');
  });

  it.each(['confirmApprove', 'confirmReject', 'approve', 'reject'] as const)(
    '%s answers 404 for an invalid token',
    async (method) => {
      const { controller, res, status, html } = setup(null);
      await controller[method]('tok', res);
      expect(status).toHaveBeenCalledWith(404);
      expect(html()).toContain('Link invalid');
    },
  );
});
