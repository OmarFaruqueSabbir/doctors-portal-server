const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

//middleware
app.use(cors());
app.use(express.json());



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.3fxov.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).send({ message: 'UnAuthorized access' });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
      if (err) {
        return res.status(403).send({ message: 'Forbidden access' })
      }
      req.decoded = decoded;
      next();
    });
  }

async function run() {
    try {
        await client.connect();
        // console.log('Database Connected!')
        const servicesCollection = client.db('doctors_portal').collection('services')
        const bookingCollection = client.db('doctors_portal').collection('bookings')
        const userCollection = client.db('doctors_portal').collection('users')
        const doctorCollection = client.db('doctors_portal').collection('doctors')
        const paymentCollection = client.db('doctors_portal').collection('payments')

        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester });
            if (requesterAccount.role === 'admin') {
              next();
            }
            else {
              res.status(403).send({ message: 'forbidden' });
            }
          }

        app.post('/create-payment-intent', verifyJWT, async (req, res) =>{
          const service = req.body;
          const price = service.price;
          const amount =  price*100;
          const paymentIntent = await stripe.paymentIntents.create({
            amount: amount,
            currency: 'usd',
            payment_method_types: ['card']
          });
          res.send({clientSecret: paymentIntent.client_secret})
        })

        app.get('/services', async (req, res) => {
            const query = {}
            const cursor = servicesCollection.find(query).project({name: 1});
            const services = await cursor.toArray();
            res.send(services);

        })

        //get users in dashboard

        app.get('/user',verifyJWT, async (req, res) => {
            const users = await userCollection.find().toArray();
            res.send(users);
          });

          //Limit Dashboard features based on admin level access
        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({email: email});
            const isAdmin = user.role === 'admin'
            res.send({admin: isAdmin});
          });

        

        app.put('/user/admin/:email', verifyJWT,verifyAdmin, async (req, res) => {
            const email = req.params.email;
                const filter = { email: email }
                const updateDoc = {
                    $set: { role: 'admin' },
                };
                const result = await userCollection.updateOne(filter, updateDoc)
                res.send( result );
        })

        //before using verifyAdmin
        // app.put('/user/admin/:email', verifyJWT, async (req, res) => {
        //     const email = req.params.email;
        //     const requester = req.decoded.email;
        //     const requesterAccount = await userCollection.findOne({email: requester})
        //     if(requesterAccount.role === 'admin'){
        //         const filter = { email: email }
        //         const updateDoc = {
        //             $set: { role: 'admin' },
        //         };
        //         const result = await userCollection.updateOne(filter, updateDoc)
        //         res.send( result );
        //     }else{
        //         res.status(403).send({message: 'forbidden'});
        //     }

        // })

        // app.put('/user/admin/:email', async (req, res) => {
        //     const email = req.params.email
        //     const filter = { email: email }
        //     const updateDoc = {
        //         $set: { role: 'admin' },
        //     };
        //     const result = await userCollection.updateOne(filter, updateDoc)
        //     res.send({ result });

        // })

        app.put('/user/:email', async (req, res) => {
            const email = req.params.email
            const user = req.body
            const filter = { email: email }
            const options = { upsert: true }
            const updateDoc = {
                $set: user,
            };
            const result = await userCollection.updateOne(filter, updateDoc, options)
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
            res.send({ result, token });

        })


        app.get('/available', async (req, res) => {
            const date = req.query.date

            //step1: get all services
            const services = await servicesCollection.find().toArray();


            //step2: get the booking of that day
            const query = { date: date };
            const bookings = await bookingCollection.find(query).toArray();


            //step3: for each service

            services.forEach(service => {
                //step4 : find bookings for that service
                const serviceBooking = bookings.filter(book => book.treatment === service.name)
                //step 5: select slot for service bookings
                const booked = serviceBooking.map(book => book.slot);
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

        app.get('/bookings', verifyJWT, async (req, res) => {
            const patient = req.query.patient;
            const decodedEmail = req.decoded.email
            if (patient === decodedEmail) {
                const query = { patient: patient };
                const bookings = await bookingCollection.find(query).toArray();
                return res.send(bookings);
            }
            else {
                return res.status(403).send({ message: "access is denied" });
            }
        })

        app.get('/bookings/:id', verifyJWT, async (req, res) => {
          const id = req.params.id;
            const query = {_id: ObjectId(id)};
            const booking = await bookingCollection.findOne(query);
            res.send(booking)

        })




        app.post('/bookings', async (req, res) => {
            const booking = req.body
            const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient }
            const exists = await bookingCollection.findOne(query);
            if (exists) {
                return res.send({ success: false, booking: exists })
            }
            const result = bookingCollection.insertOne(booking);
            res.send({ success: true, result });
        });

        app.patch('/bookings/:id', verifyJWT, async(req, res) =>{
          const id  = req.params.id;
          const payment = req.body;
          const filter = {_id: ObjectId(id)};
          const updatedDoc = {
            $set: {
              paid: true,
              transactionId: payment.transactionId
            }
          }
    
          const result = await paymentCollection.insertOne(payment);
          const updatedBooking = await bookingCollection.updateOne(filter, updatedDoc);
          res.send(updatedBooking);
        })

        //get all doctors
        app.get('/doctor', verifyJWT, verifyAdmin, async(req, res) =>{
            const doctors = await doctorCollection.find().toArray();
            res.send(doctors);
          })
      
          app.post('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
            const doctor = req.body;
            const result = await doctorCollection.insertOne(doctor);
            res.send(result);
          });

          app.delete('/doctor/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = {email: email}
            const result = await doctorCollection.deleteOne(filter);
            res.send(result);
          });

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