const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');
const app = express();
const port = process.env.PORT || 5000;
//middleware
app.use(cors());
app.use(express.json())



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.3fxov.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
    try {
        await client.connect();
        // console.log('Database Connected!')
        const servicesCollection = client.db('doctors_portal').collection('services')
        const bookingCollection = client.db('doctors_portal').collection('bookings')
        const userCollection = client.db('doctors_portal').collection('users')

        app.get('/services', async (req, res) => {
            const query = {}
            const cursor = servicesCollection.find(query);
            const services = await cursor.toArray();
            res.send(services);

        })

        app.put('/user/:email', async (req, res) => {
            const email = req.params.email
            const user = req.body
            const filter = {email: email}
            const options = {upsert: true}
            const updateDoc = {
                $set: user,
              };
              const result = await userCollection.updateOne(filter,updateDoc,options)
            res.send(result);

        })

        
        app.get('/available', async (req, res) => {
            const date = req.query.date

            //step1: get all services
            const services = await servicesCollection.find().toArray();
            

            //step2: get the booking of that day
            const query = {date: date};
            const bookings = await bookingCollection.find(query).toArray();
            

            //step3: for each service

            services.forEach(service =>{
                //step4 : find bookings for that service
                const serviceBooking = bookings.filter(book=> book.treatment === service.name)
                //step 5: select slot for service bookings
                const booked = serviceBooking.map(book=> book.slot);
                //step 6: select those slots are not in  booked
                const available = service.slots.filter(slot => !booked.includes(slot))
                service.slots = available
                // service.booked = serviceBooking.map(s=> s.slot)
            })
            res.send(services)

        })

        /**
 * API naming convention
 * app.get('/booking') // get all booking in this collection or get more than one or by filter
 * app.get('/booking/:id') //get a specific booking
 * app.post('/booking/') // add a new booking
 * app.patch('/booking/:id') // update specfically
 * app.put('/booking/:id') // upsert => update (if exists) or insert
 * app.delete('/booking/:id') // delete specfically
 */

        app.get('/bookings',async(req,res)=>{
            const patient = req.query.patient;
            const query = {patient: patient};
            const bookings = await bookingCollection.find(query).toArray();
            res.send(bookings);
        })


        app.post('/bookings', async (req, res) => {
            const booking = req.body
            const query = {treatment: booking.treatment, date: booking.date, patient: booking.patient}
            const exists = await bookingCollection.findOne(query);
            if(exists){
               return res.send({success: false, booking: exists}) 
            }
            const result = bookingCollection.insertOne(booking);
            res.send({success: true, result});
        })




    } finally {

    }

}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Hello From Doctors');
});

app.listen(port, () => {
    console.log('Listening to port', port);
})