"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var express_1 = __importDefault(require("express"));
var router = express_1.default.Router();
router.get('/', function (req, res) {
    res.send('GET: /post');
});
router.post('/', function (req, res) {
    res.send('POST: /post');
});
router.delete('/', function (req, res) {
    res.send('DELETE: /post');
});
exports.default = router;
