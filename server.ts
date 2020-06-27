import * as http from 'http';
import * as sockjs from 'sockjs';
import * as Debug from 'debug';
import { match } from 'path-to-regexp';

const debug = Debug('webrtc:server');
interface RoomParams {
	roomId: string;
	sessionId: string;
	transport: string;
}

const WS_PREFIX = '';
const webRTCServer = sockjs.createServer({ prefix: WS_PREFIX });
const urlMath = match<RoomParams>(`${WS_PREFIX}/:roomId/:sessionId/:transport`, { decode: decodeURIComponent });

class Message {
	private cmd: string;
	private encoding: BufferEncoding;
	private data: string | Uint8Array;

	constructor(cmd: string, data: string | Uint8Array) {
		this.cmd = cmd;
		this.encoding = typeof data === 'string' ? 'utf8' : 'binary';
		this.data = data;
	}

	toJSON() {
		let encoding = this.encoding;
		let data: string;
		if (this.data instanceof Uint8Array) {
			encoding = 'base64';
			data = Buffer.from(this.data).toString('base64');
		} else {
			data = this.data;
		}

		return {
			cmd: this.cmd,
			data,
			encoding
		};
	}

	toString(): string {
		return JSON.stringify(this.toJSON());
	}

	// toBinary(): Uint8Array {

	// }
}

class Room {
	private roomId: string;
	private room: Map<String, sockjs.Connection>;

	constructor(roomId: string) {
		this.roomId = roomId;
		this.room = new Map();
	}

	/**
	 * 广播
	 * 
	 * @param msg 
	 */
	broadcast(msg: Message): void {
		const conns = this.room.values();
		console.log(conns)
		for (let conn of conns) {
			conn.write(msg.toString());
		}
	}

	/**
	 * 给某人发送消息
	 * 
	 * @param sessionId 
	 * @param msg 
	 */
	send(sessionId: string, msg: Message): void {
		const conn = this.room.get(sessionId);
		if (!conn) return;

		conn.write(msg.toString());
	}

	/**
	 * 加入教室
	 * 
	 * @param sessionId 
	 * @param conn 
	 */
	join(sessionId: string, conn: sockjs.Connection): void {
		console.debug('join')
		this.room.set(sessionId, conn);

		this.broadcast(new Message('join', ''));
	}

	/**
	 * 离开教室
	 * 
	 * @param sessionId 
	 */
	leave(sessionId: string): sockjs.Connection | void {
		const conn = this.room.get(sessionId);
		if (!conn) return;

		this.room.delete(sessionId);
		return conn;
	}
}

const rooms = new Map<string, Room>();

webRTCServer.on('connection', (conn) => {
	const matched = urlMath(conn.url);
	if (!matched) return conn.close('not matched');

	// 加入教室
	const { roomId, sessionId } = matched.params;
	const room = rooms.get(roomId) || new Room(roomId);
	room.join(sessionId, conn);

	conn.on('data', (msg) => {
		conn.write(`echo => ${msg}`);
	});

	conn.on('close', () => {
		console.debug('colse', sessionId);
		room.leave(sessionId);
	});
});

const server = http.createServer();
webRTCServer.installHandlers(server);
server.listen(4000, '0.0.0.0');