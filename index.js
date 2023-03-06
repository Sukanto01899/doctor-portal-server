const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config();
const port = process.env.port || 5000
app.use(cors());
app.use(express.json());


app.listen(port, ()=>{
    console.log('Server Running')
})