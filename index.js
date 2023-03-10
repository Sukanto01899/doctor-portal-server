const express = require('express');
const { MongoClient, ServerApiVersion } = require('mongodb');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const postmarkTransport = require('nodemailer-postmark-transport')
require('dotenv').config();
const port = process.env.port || 5000
app.use(cors());
app.use(express.json());

const verifyJWT = (req, res, next)=>{
    const auth_header = req.headers.authorization;
    
    if(!auth_header){
        return res.status(401).send({message: 'Unauthorize'})
    }
    const token = auth_header.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_KEY, (error, decoded)=>{
        if(error){
            return res.status(403).send({message: "Forbidden"})
        }
        req.decoded = decoded
        next()
    })
}

const mailTransport = nodemailer.createTransport(postmarkTransport({
    auth: {
      apiKey: process.env.EMAIL_SENDER_KEY
    }
  }))

const sendAppointmentEmail =async (booking)=>{
    console.log('inside sendAppointmentEmail', booking)
    const {patient, patientName, treatment, date, slot} = booking;

    const mailOptions = {
        from: 'markerter@dm-ahsan.com',
        to: `${patient}`,
        subject: `Appointment booked for ${treatment}`,
        text: `Appointment booked for ${treatment}`,
        html: `<div>
            <h1>Hello! you have new appointment</h1>
            <pre>
            Name: ${patientName},
            Treatment: ${treatment},
            Date: ${date},
            slot: ${slot}
            </pre>
        </div>`
      }

    return mailTransport.sendMail(mailOptions)
    .then(() => console.log('Email sent successfully!'))
    .catch((error) => console.error('There was an error while sending the email:', error))
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.ntymkpq.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run(){
    try{
        await client.connect();
        const database = client.db('doctors-portal');
        const services = database.collection('services');
        const bookings = database.collection('bookings');
        const users = database.collection('users')
        const doctors = database.collection('doctors')

        // Verify Admin middleware
        const verifyAdmin = async(req, res, next)=>{
            const requestor = req.decoded.email;
            const requestorAccount = await users.findOne({email: requestor});
            if(requestorAccount.role === 'admin'){
                next()
            }else{
                res.status(403).send({message: 'Forbidden'})
            }
        }

        app.get('/', (req, res)=>{
            res.send('Doctor portal')
        })

        app.get('/services',async (req, res)=>{
            const query = {};
            const cursor = services.find({}).project({name: 1})
            const all_services =await cursor.toArray();
            res.send(all_services)
        })

        app.post('/service', async (req, res)=>{
            const booking = req.body;
            const query = {treatment: booking.treatment, date: booking.date, patient: booking.patient};
            const exist = await bookings.findOne(query);
            if(exist){
                return res.send({success: false, exist})
            }
            const result = await bookings.insertOne(booking);
            console.log('inside service api', result)
            sendAppointmentEmail(booking) 
            res.send({success:true, result})
            
        })

        app.get('/available', async (req, res)=>{
            const date = req.query.date;

            // 1- Get all service
            const allService = await services.find().toArray();

            // 2- Get booking of that day
            const query = {date: date}
            const booking = await bookings.find(query).toArray();

            /// 3- For each service
            allService.forEach(service => {
                // 4- Find booking for that service
                const serviceBooking = booking.filter(book => book.treatment === service.name);

                // 5- Select slot for service booking
                const bookedSlots = serviceBooking.map(book => book.slot);

                // 6- Select those slots that are not in bookedSlots
                const available = service.slots.filter(slot => !bookedSlots.includes(slot))

                service.slots = available;
            })
            res.send(allService)
        })

        app.get('/booking',verifyJWT, async (req, res)=>{
            const email = req.decoded.email;
            const patient = req.query.patient;
            if(email === patient){
                const filter = {patient: patient};
                const booking = await bookings.find(filter).toArray();
                res.send(booking)
            }
            else{
                res.status(403).send({message: 'Forbidden'})
            }
        })

        app.put('/user/:email',async (req, res)=>{
            const email = req.params.email;
            const user = req.body;
            const filter = {email: email};
            const option = {upsert: true};
            const updateDoc = {
                $set: user
            }
            const result = await users.updateOne(filter, updateDoc, option);
            const token = jwt.sign({email: email}, process.env.ACCESS_KEY, {expiresIn: '1h'})
            res.send({result, token: token})
        })

        app.get('/user',verifyJWT, async (req, res)=>{
            const allUser = await users.find().toArray();
            res.send(allUser)
        })

        app.put('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res)=>{
            const email = req.params.email;
                const filter = {email: email};
                const updateDoc = {
                $set: {role: 'admin'}
                }
                const result = await users.updateOne(filter, updateDoc);
                res.send(result)
            
        })

        app.get('/admin/:email', async (req, res)=>{
            const email = req.params.email;
            const user = await users.findOne({email: email});
            const isAdmin = user.role === 'admin';
            res.send({admin: isAdmin})
        })

        app.post('/doctor',verifyJWT,verifyAdmin, async (req, res)=>{
            const doctor = req.body;
            const result = await doctors.insertOne(doctor);
            res.send(result)
        })

        app.get('/doctors',verifyJWT, verifyAdmin, async (req, res)=>{
            const allDoctor = await doctors.find().toArray()
            res.send(allDoctor)
        })

        app.delete('/doctors/:email',verifyJWT, verifyAdmin, async (req, res)=>{
            const email = req.params.email;
            const query = {email:email}
            const result = await doctors.deleteOne(query);
            res.send(result)
        })
    }
    finally{}
};
run().catch(console.dir)


app.listen(port, ()=>{
    console.log('Server Running')
})