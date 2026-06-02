import {
  type OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { WsServerEvent } from '@chista/events';
import type { Server, Socket } from 'socket.io';

@WebSocketGateway({ namespace: '/ws', cors: { origin: '*' } })
export class SessionsGateway implements OnGatewayConnection {
  @WebSocketServer() server!: Server;

  handleConnection(client: Socket): void {
    const orgId = client.handshake.query.orgId as string | undefined;
    if (orgId) client.join(`org:${orgId}`);
    const sessionId = client.handshake.query.sessionId as string | undefined;
    if (sessionId) client.join(`session:${sessionId}`);
  }

  emitToOrg(orgId: string, event: WsServerEvent): void {
    this.server?.to(`org:${orgId}`).emit('event', event);
  }

  emitToSession(sessionId: string, event: WsServerEvent): void {
    this.server?.to(`session:${sessionId}`).emit('event', event);
  }
}
