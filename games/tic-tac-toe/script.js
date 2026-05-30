class TicTacToe {
    constructor() {
        this.board = Array(9).fill('');
        this.currentPlayer = 'X';
        this.gameOver = false;
        this.scoreX = localStorage.getItem('scoreX') || 0;
        this.scoreO = localStorage.getItem('scoreO') || 0;
        this.mode = 'pvp';
        this.cells = document.querySelectorAll('.cell');
        this.gameBoard = document.getElementById('gameBoard');
        this.statusDisplay = document.getElementById('status');
        this.resetBtn = document.getElementById('resetBtn');
        this.resetScoresBtn = document.getElementById('resetScoresBtn');
        this.modeSelect = document.getElementById('modeSelect');
        this.scoreXDisplay = document.getElementById('scoreX');
        this.scoreODisplay = document.getElementById('scoreO');

        this.init();
    }

    init() {
        this.updateScoresDisplay();
        this.setupEventListeners();
    }

    setupEventListeners() {
        this.cells.forEach(cell => {
            cell.addEventListener('click', (e) => this.handleCellClick(e));
        });

        this.resetBtn.addEventListener('click', () => this.resetGame());
        this.resetScoresBtn.addEventListener('click', () => this.resetScores());
        this.modeSelect.addEventListener('change', (e) => {
            this.mode = e.target.value;
            this.resetGame();
        });
    }

    handleCellClick(e) {
        const cell = e.target;
        const index = parseInt(cell.dataset.index);

        if (this.board[index] !== '' || this.gameOver) {
            return;
        }

        this.makeMove(index, this.currentPlayer);

        if (!this.gameOver && this.mode === 'pvc' && this.currentPlayer === 'O') {
            setTimeout(() => this.computerMove(), 500);
        }
    }

    makeMove(index, player) {
        this.board[index] = player;
        this.updateCellDisplay(index, player);

        const result = this.checkGameStatus();
        if (result === 'draw') {
            this.endGame('平局');
        } else if (result === 'win') {
            this.endGame(`${player} 获胜！`);
            this.updateScore(player);
        } else {
            this.currentPlayer = player === 'X' ? 'O' : 'X';
            this.updateStatus();
        }
    }

    computerMove() {
        const emptyIndices = this.board
            .map((val, idx) => (val === '' ? idx : null))
            .filter(val => val !== null);

        if (emptyIndices.length === 0) return;

        const bestMove = this.findBestMove(emptyIndices);
        this.makeMove(bestMove, 'O');
    }

    findBestMove(emptyIndices) {
        // 优先检查能否一步获胜
        for (let idx of emptyIndices) {
            this.board[idx] = 'O';
            if (this.checkWin('O')) {
                this.board[idx] = '';
                return idx;
            }
            this.board[idx] = '';
        }

        // 阻止玩家获胜
        for (let idx of emptyIndices) {
            this.board[idx] = 'X';
            if (this.checkWin('X')) {
                this.board[idx] = '';
                return idx;
            }
            this.board[idx] = '';
        }

        // 优先选择中心
        if (emptyIndices.includes(4)) return 4;

        // 优先选择角落
        const corners = [0, 2, 6, 8].filter(i => emptyIndices.includes(i));
        if (corners.length > 0) {
            return corners[Math.floor(Math.random() * corners.length)];
        }

        // 随机选择
        return emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
    }

    checkGameStatus() {
        if (this.checkWin(this.currentPlayer)) {
            return 'win';
        }

        if (this.board.every(cell => cell !== '')) {
            return 'draw';
        }

        return 'continue';
    }

    checkWin(player) {
        const winPatterns = [
            [0, 1, 2],
            [3, 4, 5],
            [6, 7, 8],
            [0, 3, 6],
            [1, 4, 7],
            [2, 5, 8],
            [0, 4, 8],
            [2, 4, 6],
        ];

        return winPatterns.some(pattern =>
            pattern.every(index => this.board[index] === player)
        );
    }

    updateCellDisplay(index, player) {
        const cell = this.cells[index];
        cell.textContent = player;
        cell.classList.add('taken');
        cell.classList.add(player.toLowerCase());
    }

    endGame(message) {
        this.gameOver = true;
        this.statusDisplay.textContent = message;

        if (message.includes('获胜')) {
            const winner = message[0];
            const winningIndices = this.getWinningIndices(winner);
            winningIndices.forEach(idx => {
                this.cells[idx].classList.add('winner');
            });
        }
    }

    getWinningIndices(player) {
        const winPatterns = [
            [0, 1, 2],
            [3, 4, 5],
            [6, 7, 8],
            [0, 3, 6],
            [1, 4, 7],
            [2, 5, 8],
            [0, 4, 8],
            [2, 4, 6],
        ];

        for (let pattern of winPatterns) {
            if (pattern.every(index => this.board[index] === player)) {
                return pattern;
            }
        }

        return [];
    }

    updateStatus() {
        if (this.mode === 'pvc') {
            this.statusDisplay.textContent =
                this.currentPlayer === 'X'
                    ? '你的回合'
                    : '电脑思考中...';
        } else {
            this.statusDisplay.textContent = `玩家 ${this.currentPlayer} 的回合`;
        }
    }

    updateScore(player) {
        if (player === 'X') {
            this.scoreX++;
        } else {
            this.scoreO++;
        }
        localStorage.setItem('scoreX', this.scoreX);
        localStorage.setItem('scoreO', this.scoreO);
        this.updateScoresDisplay();
    }

    updateScoresDisplay() {
        this.scoreXDisplay.textContent = this.scoreX;
        this.scoreODisplay.textContent = this.scoreO;
    }

    resetGame() {
        this.board = Array(9).fill('');
        this.currentPlayer = 'X';
        this.gameOver = false;

        this.cells.forEach(cell => {
            cell.textContent = '';
            cell.classList.remove('taken', 'x', 'o', 'winner');
        });

        this.updateStatus();
    }

    resetScores() {
        this.scoreX = 0;
        this.scoreO = 0;
        localStorage.setItem('scoreX', this.scoreX);
        localStorage.setItem('scoreO', this.scoreO);
        this.updateScoresDisplay();
        this.resetGame();
    }
}

// 初始化游戏
document.addEventListener('DOMContentLoaded', () => {
    new TicTacToe();
});
